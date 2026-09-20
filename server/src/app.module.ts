import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { UploadModule } from './upload/upload.module';
import { FacultyModule } from './faculty/faculty.module';

@Module({
  imports: [
    PrismaModule,
    UploadModule,
    FacultyModule,
  ],
})
export class AppModule {}
