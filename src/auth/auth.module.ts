import { Module } from "@nestjs/common";
import { AdminGuard } from "./admin.guard";
import { FirebaseAuthGuard } from "./firebase-auth.guard";
import { FirebaseService } from "./firebase.service";
import { RolesGuard } from "./roles.guard";

@Module({
  providers: [FirebaseService, FirebaseAuthGuard, AdminGuard, RolesGuard],
  exports: [FirebaseService, FirebaseAuthGuard, AdminGuard, RolesGuard],
})
export class AuthModule {}
