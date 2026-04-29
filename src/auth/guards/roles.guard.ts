import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!allowed || allowed.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user as { role?: Role } | undefined;
    if (!user || !user.role || !allowed.includes(user.role)) {
      throw new ForbiddenException('insufficient role');
    }
    return true;
  }
}
