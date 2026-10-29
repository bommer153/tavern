import { Body, Controller, Get, HttpCode, Module, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createOrderSchema, orderActionSchema, reviewSchema } from '@tavern/shared';
import { type AuthUser, CurrentUser, notFound, ObjectIdPipe, ZodPipe } from '../common/http.js';
import { UsersModule } from '../users/users.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { OrdersService } from './orders.service.js';

const ACTIONS = ['accept', 'decline', 'cancel', 'start', 'complete', 'dispute'] as const;

@ApiTags('orders')
@Controller('orders')
class OrdersController {
  constructor(private orders: OrdersService) {}

  @Post()
  create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(createOrderSchema)) b: any) {
    return this.orders.create(u.id, b);
  }

  @Get('me')
  mine(@CurrentUser() u: AuthUser, @Query('as') as?: string, @Query('status') status?: string, @Query('page') page = '1') {
    return this.orders.listMine(u.id, as === 'companion' ? 'companion' : 'customer', status, Math.max(1, Number(page) || 1));
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string) {
    return this.orders.get(id, u.id, u.roles);
  }

  @Post(':id/review')
  @HttpCode(204)
  review(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string, @Body(new ZodPipe(reviewSchema)) b: any) {
    return this.orders.review(id, u.id, b.rating, b.comment);
  }

  @Post(':id/:action')
  @HttpCode(200)
  act(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string, @Param('action') action: string, @Body(new ZodPipe(orderActionSchema)) b: any) {
    if (!ACTIONS.includes(action as any)) throw notFound();
    return this.orders.act(id, u.id, action as (typeof ACTIONS)[number], b.reason);
  }
}

@Module({ imports: [WalletModule, UsersModule], controllers: [OrdersController], providers: [OrdersService], exports: [OrdersService] })
export class OrdersModule {}
