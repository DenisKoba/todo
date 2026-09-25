import { Module } from "@nestjs/common";
import { Controller, Get } from "@nestjs/common";
import { ListsController } from "./lists/lists.controller";
import { PrismaService } from "./prisma/prisma.service";
import { ProfileController } from "./profile/profile.controller";

@Controller("health")
class HealthController {
  @Get()
  health() {
    return { status: "ok", service: "todo-api" };
  }
}

@Module({
  controllers: [HealthController, ProfileController, ListsController],
  providers: [PrismaService],
})
export class AppModule {}
