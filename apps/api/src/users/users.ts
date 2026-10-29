import { Body, Controller, Delete, Get, HttpCode, Injectable, Module, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { updateProfileSchema } from '@tavern/shared';
import { toMe } from '../auth/auth.service.js';
import { type AuthUser, badRequest, CurrentUser, notFound, ObjectIdPipe, Public, ZodPipe } from '../common/http.js';
import { InjectM, type M } from '../db/database.module.js';
import type { UserDoc } from '../db/schemas.js';

@Injectable()
export class BlocksService {
  constructor(@InjectM('Block') private blocks: M<'Block'>) {}
  /** True if either user has blocked the other. */
  async blockedBetween(a: string, b: string) {
    return !!(await this.blocks.exists({
      $or: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    }));
  }
}

@ApiTags('users')
@Controller('users')
class UsersController {
  constructor(
    @InjectM('User') private users: M<'User'>,
    @InjectM('Block') private blocks: M<'Block'>,
  ) {}

  @Get('me')
  async me(@CurrentUser() u: AuthUser) {
    const user = await this.users.findById(u.id).lean();
    if (!user) throw notFound('User');
    return toMe(user as unknown as UserDoc);
  }

  @Patch('me')
  async update(@CurrentUser() u: AuthUser, @Body(new ZodPipe(updateProfileSchema)) b: any) {
    const set: Record<string, unknown> = {};
    for (const k of ['displayName', 'bio', 'avatarUrl'] as const) if (b[k] !== undefined) set[k] = b[k];
    for (const [k, v] of Object.entries(b.settings ?? {})) if (v !== undefined) set[`settings.${k}`] = v;
    for (const [k, v] of Object.entries(b.notificationPrefs ?? {})) set[`notificationPrefs.${k}`] = v;
    const user = await this.users.findByIdAndUpdate(u.id, { $set: set }, { returnDocument: 'after' }).lean();
    return toMe(user as unknown as UserDoc);
  }

  @Public()
  @Get(':username')
  async publicProfile(@Param('username') username: string) {
    const user = await this.users.findOne({ usernameLower: username.toLowerCase(), status: 'active' }).lean();
    if (!user) throw notFound('User');
    return { id: String(user._id), username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl, bio: user.bio, roles: user.roles };
  }

  @Post(':id/block')
  @HttpCode(204)
  async block(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string) {
    if (id === u.id) throw badRequest('INVALID', 'You cannot block yourself');
    await this.blocks.updateOne({ blockerId: u.id, blockedId: id }, {}, { upsert: true });
  }

  @Delete(':id/block')
  @HttpCode(204)
  async unblock(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string) {
    await this.blocks.deleteOne({ blockerId: u.id, blockedId: id });
  }
}

@ApiTags('games')
@Controller('games')
class GamesController {
  constructor(@InjectM('Game') private games: M<'Game'>) {}
  @Public()
  @Get()
  async list() {
    const games = await this.games.find({ active: true }).sort({ sortOrder: 1, name: 1 }).lean();
    return games.map(toGame);
  }
}

export const toGame = (g: { _id: unknown; slug: string; name: string; iconUrl?: string | null; coverUrl?: string | null; platforms: string[]; ranks: string[]; roles: string[] }) => ({
  id: String(g._id),
  slug: g.slug,
  name: g.name,
  iconUrl: g.iconUrl ?? undefined,
  coverUrl: g.coverUrl ?? undefined,
  platforms: g.platforms,
  ranks: g.ranks,
  roles: g.roles,
});

@Module({ controllers: [UsersController, GamesController], providers: [BlocksService], exports: [BlocksService] })
export class UsersModule {}
