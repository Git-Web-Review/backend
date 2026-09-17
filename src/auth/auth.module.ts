import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AdminGuard } from "./admin.guard";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { FirebaseAuthService } from "./firebase-auth.service";
import { FirebaseService } from "./firebase.service";
import { InternalJwtService } from "./internal-jwt.service";
import { ServiceAccountsController } from "./service-accounts.controller";
import { ServiceAccountsService } from "./service-accounts.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController, ServiceAccountsController],
  providers: [
    FirebaseService,
    FirebaseAuthService,
    InternalJwtService,
    ServiceAccountsService,
    AuthGuard,
    AdminGuard,
  ],
  exports: [
    FirebaseService,
    FirebaseAuthService,
    InternalJwtService,
    ServiceAccountsService,
    AuthGuard,
    AdminGuard,
  ],
})
export class AuthModule {}
