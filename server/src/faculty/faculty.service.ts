import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FacultyService {
  constructor(private prisma: PrismaService) {}

  async getUniqueSections() {
    const activeUpload = await this.prisma.timetableUpload.findFirst({
      where: { isActive: true },
      orderBy: { uploadedAt: 'desc' },
    });

    if (!activeUpload) return [];

    const assignments = await this.prisma.workloadAssignment.findMany({
      where: { uploadId: activeUpload.id },
      select: { branch: true },
      distinct: ['branch'],
      orderBy: { branch: 'asc' },
    });

    return assignments.map(a => a.branch);
  }

  async getWorkloadData(section?: string, search?: string) {
    const activeUpload = await this.prisma.timetableUpload.findFirst({
      where: { isActive: true },
      orderBy: { uploadedAt: 'desc' },
    });

    if (!activeUpload) {
      return { totalFacultyCount: 0, activeSection: section || 'ALL', facultyList: [] };
    }

    const allAssignments = await this.prisma.workloadAssignment.findMany({
      where: { uploadId: activeUpload.id },
      include: { faculty: true },
    });

    // Aggregate by faculty
    const facultyMap: { [key: string]: any } = {};

    allAssignments.forEach(a => {
      const f = a.faculty;
      if (!facultyMap[f.id]) {
        facultyMap[f.id] = {
          id: f.id,
          shortName: f.shortName,
          fullName: f.fullName,
          department: f.department || 'General',
          overallWorkload: 0,
          overallTheoryHours: 0,
          overallTutorialHours: 0,
          overallLabHours: 0,
          sectionWorkload: 0,
          sectionTheoryHours: 0,
          sectionTutorialHours: 0,
          sectionLabHours: 0,
          assignedSectionsSet: new Set<string>(),
          classes: [],
        };
      }

      const fac = facultyMap[f.id];
      fac.assignedSectionsSet.add(a.branch);

      // Overall workload totals across all sections
      fac.overallWorkload += a.hours;
      if (a.sessionType === 'Theory') fac.overallTheoryHours += a.hours;
      if (a.sessionType === 'Tutorial') fac.overallTutorialHours += a.hours;
      if (a.sessionType === 'Lab') fac.overallLabHours += a.hours;

      // Section workload totals ONLY if matching specific section filter
      if (section && section.toUpperCase() !== 'ALL' && a.branch.toUpperCase() === section.toUpperCase()) {
        fac.sectionWorkload += a.hours;
        if (a.sessionType === 'Theory') fac.sectionTheoryHours += a.hours;
        if (a.sessionType === 'Tutorial') fac.sectionTutorialHours += a.hours;
        if (a.sessionType === 'Lab') fac.sectionLabHours += a.hours;
      }

      fac.classes.push({
        id: a.id,
        branch: a.branch,
        subjectName: a.subjectName,
        subjectShort: a.subjectShort,
        roomNumber: a.roomNumber,
        sessionType: a.sessionType,
        hours: a.hours,
        coFacultyList: a.coFacultyList,
      });
    });

    let result = Object.values(facultyMap).map(f => ({
      ...f,
      assignedSections: Array.from(f.assignedSectionsSet).sort(),
    }));

    // Filter by section if specified
    if (section && section.toUpperCase() !== 'ALL') {
      result = result.filter(f => f.assignedSectionsSet.has(section));
    }

    // Filter by search query if provided
    if (search && search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        f => f.shortName.toLowerCase().includes(q) || f.fullName.toLowerCase().includes(q),
      );
    }

    // Sort by overall total workload descending
    result.sort((a, b) => b.overallWorkload - a.overallWorkload);

    return {
      activeSection: section || 'ALL',
      totalFacultyCount: result.length,
      totalCampusWorkloadHours: result.reduce((sum, f) => sum + f.overallWorkload, 0),
      highestWorkload: result[0]?.overallWorkload || 0,
      averageWorkload: Math.round(
        result.reduce((sum, f) => sum + f.overallWorkload, 0) / (result.length || 1),
      ),
      facultyList: result,
    };
  }

  async getFacultyDetails(shortName: string) {
    const activeUpload = await this.prisma.timetableUpload.findFirst({
      where: { isActive: true },
      orderBy: { uploadedAt: 'desc' },
    });

    const faculty = await this.prisma.faculty.findFirst({
      where: {
        OR: [
          { shortName: { equals: shortName } },
          { fullName: { contains: shortName } },
        ],
      },
    });

    if (!faculty || !activeUpload) return null;

    const assignments = await this.prisma.workloadAssignment.findMany({
      where: {
        uploadId: activeUpload.id,
        facultyId: faculty.id,
      },
      orderBy: [{ branch: 'asc' }, { sessionType: 'asc' }],
    });

    const overallWorkload = assignments.reduce((sum, a) => sum + a.hours, 0);

    return {
      faculty,
      overallWorkload,
      assignments,
    };
  }
}
