import { Injectable, BadRequestException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as xlsx from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class UploadService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  private getCanonicalShortName(rawShort: string): string {
    if (!rawShort) return 'UNKNOWN';
    return rawShort.replace(/^(Dr\.|Mr\.|Ms\.|Mrs\.)\s*/i, '').trim();
  }

  async onModuleInit() {
    // Auto-seed from tt-workload.xlsx if database has no active upload
    const existingUpload = await this.prisma.timetableUpload.findFirst({ where: { isActive: true } });
    if (!existingUpload) {
      const defaultFilePath = '/Users/saranneralla/Documents/Documents-Saran-MacBook-Air/timetables/tt-workload.xlsx';
      if (fs.existsSync(defaultFilePath)) {
        console.log('🌱 Seeding database from default tt-workload.xlsx...');
        const buffer = fs.readFileSync(defaultFilePath);
        await this.processExcelFile(buffer, 'tt-workload.xlsx');
      }
    }
  }

  async processExcelFile(fileBuffer: Buffer, filename: string) {
    let workbook: xlsx.WorkBook;
    try {
      workbook = xlsx.read(fileBuffer, { type: 'buffer' });
    } catch (err) {
      throw new BadRequestException('Failed to parse Excel file format.');
    }

    // 1. Create TimetableUpload record
    const upload = await this.prisma.timetableUpload.create({
      data: {
        filename: filename || 'tt-workload.xlsx',
        isActive: true,
      },
    });

    // Deactivate previous uploads
    await this.prisma.timetableUpload.updateMany({
      where: { id: { not: upload.id } },
      data: { isActive: false },
    });

    // 2. Read Sheet2 (or active sheet)
    const sheetName = workbook.SheetNames.find(n => n.includes('Sheet2')) || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      throw new BadRequestException('Worksheet Sheet2 not found in uploaded file.');
    }

    const rows: any[] = xlsx.utils.sheet_to_json(sheet);
    let insertedAssignments = 0;

    for (const row of rows) {
      const branch = String(row['Branch'] || '').trim();
      if (!branch) continue;

      const roomNo = String(row['Room_no'] || '').trim();
      const subName = String(row['Subject_Name'] || '').trim();
      const subShort = String(row['sub_short'] || subName).trim();
      
      const theoryHrs = parseFloat(row['Theory_Hours'] || 0);
      const tutHrs = parseFloat(row['Tutorial_Hours'] || 0);
      const freq = parseFloat(row['Frequency'] || 1);
      const labHrs = parseFloat(row['Lab_Hours'] || 0);

      const facShortsRaw = String(row['Name_short'] || '').trim();
      const facNamesRaw = String(row['Faculty_Name'] || facShortsRaw).trim();

      const tutShortsRaw = String(row['Tutorial_Short'] || '').trim();
      const tutNamesRaw = String(row['Tutorial_Name'] || tutShortsRaw).trim();

      // Process Theory & Lab Faculty
      if (facShortsRaw && facShortsRaw.toLowerCase() !== 'none') {
        const facShorts = facShortsRaw.split(/\r?\n|;/).map(s => s.trim()).filter(Boolean);
        const facNames = facNamesRaw.split(/\r?\n|;/).map(s => s.trim()).filter(Boolean);

          const fShort = this.getCanonicalShortName(facShorts[i]);
          const fName = facNames[i] || facShorts[i];

          const faculty = await this.prisma.faculty.upsert({
            where: { shortName: fShort },
            update: { fullName: fName },
            create: { shortName: fShort, fullName: fName, department: 'General' },
          });

          // Theory Assignment
          if (theoryHrs > 0) {
            await this.prisma.workloadAssignment.create({
              data: {
                uploadId: upload.id,
                facultyId: faculty.id,
                branch,
                subjectName: subName,
                subjectShort: subShort,
                roomNumber: roomNo,
                sessionType: 'Theory',
                hours: theoryHrs,
                coFacultyList: facShorts.filter(s => s !== fShort).join(', '),
              },
            });
            insertedAssignments++;
          }

          // Lab Assignment
          if (labHrs > 0) {
            const weeklyLabHrs = labHrs * freq;
            await this.prisma.workloadAssignment.create({
              data: {
                uploadId: upload.id,
                facultyId: faculty.id,
                branch,
                subjectName: subName,
                subjectShort: subShort,
                roomNumber: roomNo,
                sessionType: 'Lab',
                hours: weeklyLabHrs,
                coFacultyList: facShorts.filter(s => s !== fShort).join(', '),
              },
            });
            insertedAssignments++;
          }
        }
      }

      // Process Tutorial Faculty
      if (tutShortsRaw && tutShortsRaw.toLowerCase() !== 'none') {
        const tutShorts = tutShortsRaw.split(/\r?\n|;/).map(s => s.trim()).filter(Boolean);
        const tutNames = tutNamesRaw.split(/\r?\n|;/).map(s => s.trim()).filter(Boolean);

        for (let i = 0; i < tutShorts.length; i++) {
          const tShort = tutShorts[i];
          const tName = tutNames[i] || tShort;

          const faculty = await this.prisma.faculty.upsert({
            where: { shortName: tShort },
            update: { fullName: tName },
            create: { shortName: tShort, fullName: tName, department: 'General' },
          });

          if (tutHrs > 0) {
            await this.prisma.workloadAssignment.create({
              data: {
                uploadId: upload.id,
                facultyId: faculty.id,
                branch,
                subjectName: subName,
                subjectShort: subShort,
                roomNumber: roomNo,
                sessionType: 'Tutorial',
                hours: tutHrs,
                coFacultyList: tutShorts.filter(s => s !== tShort).join(', '),
              },
            });
            insertedAssignments++;
          }
        }
      }
    }

    return {
      success: true,
      uploadId: upload.id,
      totalAssignments: insertedAssignments,
      message: `Successfully processed '${filename}'. Generated ${insertedAssignments} workload assignments across faculty members.`,
    };
  }

  async getUploadHistory() {
    return this.prisma.timetableUpload.findMany({
      orderBy: { uploadedAt: 'desc' },
      include: { _count: { select: { assignments: true } } },
    });
  }
}
