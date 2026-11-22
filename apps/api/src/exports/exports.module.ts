import { Module } from '@nestjs/common';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { SqsService } from './sqs.service';

@Module({
  controllers: [ExportsController],
  providers: [ExportsService, SqsService],
  exports: [ExportsService, SqsService],
})
export class ExportsModule {}
