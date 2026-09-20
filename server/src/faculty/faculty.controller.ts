import { Controller, Get, Query, Param } from '@nestjs/common';
import { FacultyService } from './faculty.service';

@Controller('api/faculty')
export class FacultyController {
  constructor(private readonly facultyService: FacultyService) {}

  @Get('sections')
  async getSections() {
    return this.facultyService.getUniqueSections();
  }

  @Get('workload')
  async getWorkload(
    @Query('section') section: string,
    @Query('search') search: string,
  ) {
    return this.facultyService.getWorkloadData(section, search);
  }

  @Get('details/:shortName')
  async getDetails(@Param('shortName') shortName: string) {
    return this.facultyService.getFacultyDetails(shortName);
  }
}
