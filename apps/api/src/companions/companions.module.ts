import { Body, Controller, Delete, Get, HttpCode, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  companionApplicationSchema,
  companionQuerySchema,
  serviceSchema,
  updateCompanionProfileSchema,
} from '@tavern/shared';
import { type AuthUser, badRequest, CurrentUser, notFound, ObjectIdPipe, OptionalAuth, Public, Roles, ZodPipe } from '../common/http.js';
import { InjectM, type M } from '../db/database.module.js';
import { CompanionsService, toService } from './companions.service.js';

@ApiTags('companions')
@Controller('companions')
class CompanionsController {
  constructor(private companions: CompanionsService) {}

  @Public()
  @Get()
  list(@Query(new ZodPipe(companionQuerySchema)) q: any) {
    return this.companions.search(q);
  }

  @Public()
  @Get('sections')
  sections() {
    return this.companions.sections();
  }

  @Get('following/me')
  following(@CurrentUser() u: AuthUser) {
    return this.companions.following(u.id);
  }

  @OptionalAuth()
  @Get(':username')
  detail(@Param('username') username: string, @CurrentUser() u?: AuthUser) {
    return this.companions.detail(username, u?.id);
  }

  @Public()
  @Get(':id/reviews')
  reviews(@Param('id', ObjectIdPipe) id: string, @Query('page') page = '1') {
    return this.companions.reviewsFor(id, Math.max(1, Number(page) || 1));
  }

  @Post(':id/follow')
  @HttpCode(204)
  follow(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string) {
    return this.companions.follow(u.id, id, true);
  }

  @Delete(':id/follow')
  @HttpCode(204)
  unfollow(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string) {
    return this.companions.follow(u.id, id, false);
  }
}

/** Self-service for approved companions. */
@ApiTags('companion')
@Controller('companion')
@Roles('companion')
class CompanionSelfController {
  constructor(
    private companions: CompanionsService,
    @InjectM('CompanionProfile') private profiles: M<'CompanionProfile'>,
    @InjectM('CompanionService') private services: M<'CompanionService'>,
    @InjectM('User') private users: M<'User'>,
    @InjectM('Game') private games: M<'Game'>,
  ) {}

  private async own(userId: string) {
    const [profile, user] = await Promise.all([this.profiles.findOne({ userId }).lean(), this.users.findById(userId).lean()]);
    if (!profile || !user) throw notFound('Companion profile');
    return { profile, user };
  }

  @Get('profile')
  async profile(@CurrentUser() u: AuthUser) {
    const { profile, user } = await this.own(u.id);
    return this.companions.buildDetail(profile, user, u.id);
  }

  @Patch('profile')
  async update(@CurrentUser() u: AuthUser, @Body(new ZodPipe(updateCompanionProfileSchema)) b: any) {
    await this.profiles.updateOne({ userId: u.id }, { $set: b });
    return this.profile(u);
  }

  @Get('services')
  async listServices(@CurrentUser() u: AuthUser) {
    return (await this.services.find({ companionId: u.id }).sort({ createdAt: 1 }).lean()).map(toService);
  }

  @Post('services')
  async create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(serviceSchema)) b: any) {
    await this.own(u.id);
    if (!(await this.games.exists({ _id: b.gameId, active: true }))) throw badRequest('INVALID_GAME', 'Game not available');
    if ((await this.services.countDocuments({ companionId: u.id })) >= 20) throw badRequest('LIMIT', 'Service limit reached');
    const s = await this.services.create({ ...b, companionId: u.id });
    await this.companions.refreshServiceSummary(u.id);
    return toService(s.toObject());
  }

  @Patch('services/:id')
  async updateService(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string, @Body(new ZodPipe(serviceSchema.partial())) b: any) {
    if (b.gameId && !(await this.games.exists({ _id: b.gameId, active: true }))) throw badRequest('INVALID_GAME', 'Game not available');
    // Orders keep a snapshot of the service, so edits never change existing orders.
    const s = await this.services.findOneAndUpdate({ _id: id, companionId: u.id }, { $set: b }, { returnDocument: 'after' }).lean();
    if (!s) throw notFound('Service');
    await this.companions.refreshServiceSummary(u.id);
    return toService(s);
  }

}

@ApiTags('applications')
@Controller('applications')
class ApplicationsController {
  constructor(private companions: CompanionsService) {}

  @Get('me')
  mine(@CurrentUser() u: AuthUser) {
    return this.companions.myApplication(u.id);
  }

  @Post()
  submit(@CurrentUser() u: AuthUser, @Body(new ZodPipe(companionApplicationSchema)) b: any) {
    return this.companions.submitApplication(u.id, b);
  }
}

@Module({
  controllers: [CompanionsController, CompanionSelfController, ApplicationsController],
  providers: [CompanionsService],
  exports: [CompanionsService],
})
export class CompanionsModule {}
