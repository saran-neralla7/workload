import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Upload,
  FileSpreadsheet,
  CheckCircle,
  Sparkles,
  BookOpen,
  Filter,
  RefreshCw,
  X,
  ChevronRight,
  Clock,
  Award,
  Printer,
  BarChart3,
  Layers,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Building2
} from 'lucide-react';
import fullFacultyData from './full_faculty_data.json';
import * as xlsx from 'xlsx';

export const inferDepartment = (fac: any): string => {
  if (fac.department && fac.department !== 'General' && fac.department !== 'Unassigned') {
    return fac.department;
  }
  const allSubNames = fac.classes ? fac.classes.map((c: any) => `${c.subjectName} ${c.subjectShort}`).join(' ') : '';
  const allBranches = fac.classes ? fac.classes.map((c: any) => c.branch).join(' ') : '';

  if (/physics|engg\.phy|phy lab/i.test(allSubNames)) return 'Department of Physics';
  if (/calculus|linear algebra|cal & la|math|m-1|probability|discrete/i.test(allSubNames)) return 'Department of Mathematics';
  if (/environmental|env\. std|chemistry|engg chem/i.test(allSubNames)) return 'Department of Chemistry & Env Science';
  if (/english|communication|soft skill|ethics/i.test(allSubNames)) return 'Department of Humanities & English';
  
  if (/cse|ai & ml|cs & ds|aita|psuc|fwd|3dda|comp\. lab/i.test(allBranches + ' ' + allSubNames)) return 'Computer Science & Engineering (CSE)';
  if (/ece|vlsi|signals/i.test(allBranches + ' ' + allSubNames)) return 'Electronics & Comm. Engineering (ECE)';
  if (/eee|electrical|power/i.test(allBranches + ' ' + allSubNames)) return 'Electrical & Electronics Engineering (EEE)';
  if (/mech|cad|workshop/i.test(allBranches + ' ' + allSubNames)) return 'Mechanical Engineering (MECH)';
  if (/civil|survey|structure/i.test(allBranches + ' ' + allSubNames)) return 'Civil Engineering (CIVIL)';
  if (/chemical/i.test(allBranches + ' ' + allSubNames)) return 'Chemical Engineering (CHEMICAL)';

  return 'Computer Science & Engineering (CSE)';
};

export default function App() {
  const [sections, setSections] = useState<string[]>([]);
  const [selectedSection, setSelectedSection] = useState<string>('ALL');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [includeTutorials, setIncludeTutorials] = useState<boolean>(true);
  const [allFacultyData, setAllFacultyData] = useState<any[]>(fullFacultyData);

  const [workloadStats, setWorkloadStats] = useState({
    activeSection: 'ALL',
    totalFacultyCount: fullFacultyData.length,
    totalCampusWorkloadHours: 0,
    highestWorkload: 0,
    averageWorkload: 0,
    facultyList: [] as any[],
  });

  // Modal States
  const [selectedFacultyDetails, setSelectedFacultyDetails] = useState<any>(null);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);

  const [sectionsModalFaculty, setSectionsModalFaculty] = useState<any>(null);
  const [isSectionsModalOpen, setIsSectionsModalOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<'workload' | 'section_timetables' | 'subject_workload' | 'collaboration'>('workload');
  const [subjectSearchQuery, setSubjectSearchQuery] = useState('');
  const [sectionSearchQuery, setSectionSearchQuery] = useState('');
  const [selectedTimetableSection, setSelectedTimetableSection] = useState<string>('CSE-1');
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');

  // Column Sorting States
  const [sortField, setSortField] = useState<'sno' | 'faculty' | 'shortCode' | 'assignedSections' | 'sectionLoad' | 'theory' | 'tutorial' | 'lab' | 'totalWorkload'>('totalWorkload');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Compute Co-Faculty Collaboration Matrix
  const collaborationMatrixData = React.useMemo(() => {
    const sharedCoursesMap: { [key: string]: any } = {};
    const partnerNetworkMap: { [fac: string]: { facultyName: string; shortCode: string; sharedClassesCount: number; partners: Set<string>; courses: any[] } } = {};

    allFacultyData.forEach(fac => {
      fac.classes.forEach((c: any) => {
        const coList = c.coFacultyList ? c.coFacultyList.split(/[\r\n,\/]+/).map((s: string) => s.trim()).filter(Boolean) : [];
        
        if (coList.length > 0) {
          const courseKey = `${c.subjectName}_${c.branch}_${c.sessionType}`;
          if (!sharedCoursesMap[courseKey]) {
            sharedCoursesMap[courseKey] = {
              subjectName: c.subjectName,
              subjectShort: c.subjectShort,
              branch: c.branch,
              sessionType: c.sessionType,
              hours: c.hours,
              primaryFaculty: fac.shortName,
              primaryFacultyName: fac.fullName,
              coFacultyList: coList,
              allFacultyList: Array.from(new Set([fac.shortName, ...coList])),
            };
          }

          if (!partnerNetworkMap[fac.shortName]) {
            partnerNetworkMap[fac.shortName] = {
              facultyName: fac.fullName,
              shortCode: fac.shortName,
              sharedClassesCount: 0,
              partners: new Set<string>(),
              courses: [],
            };
          }
          partnerNetworkMap[fac.shortName].sharedClassesCount += 1;
          coList.forEach(p => {
            if (p !== fac.shortName) partnerNetworkMap[fac.shortName].partners.add(p);
          });
          partnerNetworkMap[fac.shortName].courses.push({
            subjectName: c.subjectName,
            branch: c.branch,
            hours: c.hours,
            sessionType: c.sessionType,
            coFacultyList: c.coFacultyList,
          });
        }
      });
    });

    let coursesList = Object.values(sharedCoursesMap);
    let networkList = Object.values(partnerNetworkMap).map(item => ({
      ...item,
      partnersList: Array.from(item.partners),
    }));

    if (selectedSection && selectedSection !== 'ALL') {
      coursesList = coursesList.filter(c => c.branch.toUpperCase() === selectedSection.toUpperCase());
    }

    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      coursesList = coursesList.filter(
        c => c.subjectName.toLowerCase().includes(q) || c.primaryFacultyName.toLowerCase().includes(q) || c.branch.toLowerCase().includes(q)
      );
      networkList = networkList.filter(
        n => n.facultyName.toLowerCase().includes(q) || n.shortCode.toLowerCase().includes(q)
      );
    }

    return {
      coursesList,
      networkList,
      totalSharedCoursesCount: coursesList.length,
      collaboratingFacultyCount: networkList.length,
    };
  }, [allFacultyData, selectedSection, searchQuery]);

  // Compute Subject-Wise Workload Master Matrix across all faculty & subjects
  const subjectMasterData = React.useMemo(() => {
    const subjectMap: {
      [key: string]: {
        subjectName: string;
        subjectShort: string;
        totalHours: number;
        theoryHours: number;
        tutHours: number;
        labHours: number;
        sections: Set<string>;
        assignedFaculty: {
          facultyName: string;
          shortName: string;
          hours: number;
          sections: string[];
        }[];
      };
    } = {};

    allFacultyData.forEach(fac => {
      fac.classes.forEach((c: any) => {
        const isTut = c.sessionType === 'Tutorial';
        const isTheory = c.sessionType === 'Theory';
        const isLab = c.sessionType === 'Lab';
        const addHours = (!isTut || includeTutorials) ? c.hours : 0;
        if (addHours <= 0) return;

        const key = (c.subjectName || c.subjectShort || 'Unknown Subject').trim();
        if (!subjectMap[key]) {
          subjectMap[key] = {
            subjectName: c.subjectName || key,
            subjectShort: c.subjectShort || '',
            totalHours: 0,
            theoryHours: 0,
            tutHours: 0,
            labHours: 0,
            sections: new Set<string>(),
            assignedFaculty: []
          };
        }

        subjectMap[key].totalHours += addHours;
        if (isTheory) subjectMap[key].theoryHours += c.hours;
        if (isTut && includeTutorials) subjectMap[key].tutHours += c.hours;
        if (isLab) subjectMap[key].labHours += c.hours;
        if (c.branch) subjectMap[key].sections.add(c.branch);

        let facEntry = subjectMap[key].assignedFaculty.find(af => af.shortName === fac.shortName);
        if (!facEntry) {
          facEntry = {
            facultyName: fac.fullName,
            shortName: fac.shortName,
            hours: 0,
            sections: []
          };
          subjectMap[key].assignedFaculty.push(facEntry);
        }
        facEntry.hours += addHours;
        if (c.branch && !facEntry.sections.includes(c.branch)) {
          facEntry.sections.push(c.branch);
        }
      });
    });

    const list = Object.values(subjectMap).map(item => ({
      ...item,
      sectionsList: Array.from(item.sections).sort(),
      assignedFacultyCount: item.assignedFaculty.length
    })).sort((a, b) => b.totalHours - a.totalHours);

    const totalSubjectHours = list.reduce((sum, s) => sum + s.totalHours, 0);

    return {
      list,
      totalSubjectsCount: list.length,
      totalSubjectHours,
      averageHoursPerSubject: Math.round(totalSubjectHours / (list.length || 1)),
      topSubject: list[0] || null
    };
  }, [allFacultyData, includeTutorials]);

  // Compute Section Master Timetable View (Screenshot 2 Excel-style web page)
  const sectionMasterTimetables = React.useMemo(() => {
    const sectionMap: { [sec: string]: any[] } = {};

    allFacultyData.forEach(fac => {
      fac.classes.forEach((c: any) => {
        const sec = c.branch || 'Unassigned';
        if (!sectionMap[sec]) {
          sectionMap[sec] = [];
        }

        let existing = sectionMap[sec].find(
          item => item.subjectName === c.subjectName && item.sessionType === c.sessionType
        );

        if (existing) {
          if (!existing.facultyList.some((f: any) => f.shortName === fac.shortName)) {
            existing.facultyList.push({ fullName: fac.fullName, shortName: fac.shortName });
          }
        } else {
          sectionMap[sec].push({
            branch: c.branch,
            roomNo: c.roomNo || (c.sessionType === 'Lab' ? `${c.subjectShort || 'COMP'} LAB` : 'G-204'),
            subjectName: c.subjectName,
            subjectShort: c.subjectShort,
            theoryHours: c.sessionType === 'Theory' ? c.hours : 0,
            tutorialHours: c.sessionType === 'Tutorial' ? c.hours : 0,
            labHours: c.sessionType === 'Lab' ? c.hours : 0,
            frequency: 1,
            facultyList: [{ fullName: fac.fullName, shortName: fac.shortName }],
            coFacultyText: c.coFacultyList || ''
          });
        }
      });
    });

    return sectionMap;
  }, [allFacultyData]);

  // Extract unique sections & departments
  useEffect(() => {
    const secSet = new Set<string>();
    allFacultyData.forEach(f => {
      f.assignedSections.forEach((s: string) => secSet.add(s));
    });
    const sortedSecs = Array.from(secSet).sort();
    setSections(['ALL', ...sortedSecs]);
  }, [allFacultyData]);

  const availableDepartments = React.useMemo(() => {
    const deptSet = new Set<string>();
    allFacultyData.forEach(f => {
      deptSet.add(f.department || inferDepartment(f));
    });
    return ['ALL', ...Array.from(deptSet).sort()];
  }, [allFacultyData]);

  // Recalculate workload stats whenever section/dept filter, tutorial toggle, search, dataset, or sorting changes
  useEffect(() => {
    calculateAndFilterWorkload();
  }, [selectedSection, selectedDepartment, includeTutorials, searchQuery, allFacultyData, sortField, sortOrder]);

  // Try fetching live data from NestJS API (port 4001)
  useEffect(() => {
    fetchLiveData();
  }, []);

  const fetchLiveData = async () => {
    try {
      const res = await fetch('http://localhost:4001/api/faculty/workload?section=ALL');
      if (res.ok) {
        const data = await res.json();
        if (data.facultyList && data.facultyList.length > 0) {
          setAllFacultyData(data.facultyList);
        }
      }
    } catch (e) {
      // Fallback to full_faculty_data.json
    }
  };

  const handleSort = (field: 'sno' | 'faculty' | 'shortCode' | 'assignedSections' | 'sectionLoad' | 'theory' | 'tutorial' | 'lab' | 'totalWorkload') => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder(field === 'faculty' || field === 'shortCode' || field === 'assignedSections' ? 'asc' : 'desc');
    }
  };

  const calculateAndFilterWorkload = () => {
    let list = allFacultyData.map(f => {
      const dept = f.department || inferDepartment(f);
      let secLoad = 0;
      let secTheory = 0;
      let secTut = 0;
      let secLab = 0;

      let overallTheory = 0;
      let overallTut = 0;
      let overallLab = 0;

      // Group classes by section
      const sectionBreakdownMap: { [sec: string]: { sectionName: string; totalHours: number; classes: any[] } } = {};
      // Group classes by subject
      const subjectBreakdownMap: { [subKey: string]: { subjectName: string; subjectShort: string; totalHours: number; theoryHours: number; tutHours: number; labHours: number; sections: string[]; classes: any[] } } = {};

      f.classes.forEach((c: any) => {
        const isTut = c.sessionType === 'Tutorial';
        const isTheory = c.sessionType === 'Theory';
        const isLab = c.sessionType === 'Lab';
        const addHours = (!isTut || includeTutorials) ? c.hours : 0;

        // Overall breakdown
        if (isTheory) overallTheory += c.hours;
        if (isTut && includeTutorials) overallTut += c.hours;
        if (isLab) overallLab += c.hours;

        // Populate per-section breakdown map
        if (!sectionBreakdownMap[c.branch]) {
          sectionBreakdownMap[c.branch] = {
            sectionName: c.branch,
            totalHours: 0,
            classes: []
          };
        }
        sectionBreakdownMap[c.branch].totalHours += addHours;
        sectionBreakdownMap[c.branch].classes.push({
          ...c,
          effectiveHours: addHours
        });

        // Populate per-subject breakdown map
        const subKey = (c.subjectName || c.subjectShort || 'Unknown Subject').trim();
        if (!subjectBreakdownMap[subKey]) {
          subjectBreakdownMap[subKey] = {
            subjectName: c.subjectName || subKey,
            subjectShort: c.subjectShort || '',
            totalHours: 0,
            theoryHours: 0,
            tutHours: 0,
            labHours: 0,
            sections: [],
            classes: []
          };
        }
        subjectBreakdownMap[subKey].totalHours += addHours;
        if (isTheory) subjectBreakdownMap[subKey].theoryHours += c.hours;
        if (isTut && includeTutorials) subjectBreakdownMap[subKey].tutHours += c.hours;
        if (isLab) subjectBreakdownMap[subKey].labHours += c.hours;
        if (c.branch && !subjectBreakdownMap[subKey].sections.includes(c.branch)) {
          subjectBreakdownMap[subKey].sections.push(c.branch);
        }
        subjectBreakdownMap[subKey].classes.push({
          ...c,
          effectiveHours: addHours
        });

        // Calculate load ONLY for currently selected section filter (when section !== 'ALL')
        if (selectedSection && selectedSection !== 'ALL' && c.branch.toUpperCase() === selectedSection.toUpperCase()) {
          secLoad += addHours;
          if (isTheory) secTheory += c.hours;
          if (isTut && includeTutorials) secTut += c.hours;
          if (isLab) secLab += c.hours;
        }
      });

      const effectiveOverallTotal = overallTheory + overallTut + overallLab;
      const sectionBreakdownList = Object.values(sectionBreakdownMap).sort((a, b) => b.totalHours - a.totalHours);
      const subjectBreakdownList = Object.values(subjectBreakdownMap).sort((a, b) => b.totalHours - a.totalHours);

      return {
        ...f,
        department: dept,
        calculatedOverallTotal: effectiveOverallTotal,
        calculatedSectionTotal: secLoad,
        overallTheoryHours: overallTheory,
        overallTutorialHours: overallTut,
        overallLabHours: overallLab,
        sectionTheoryHours: secTheory,
        sectionTutorialHours: secTut,
        sectionLabHours: secLab,
        sectionBreakdownList,
        subjectBreakdownList,
      };
    });

    // Filter list by selected Section
    if (selectedSection && selectedSection !== 'ALL') {
      list = list.filter(f => f.assignedSections.includes(selectedSection));
    }

    // Filter list by selected Department
    if (selectedDepartment && selectedDepartment !== 'ALL') {
      list = list.filter(f => f.department === selectedDepartment);
    }

    // Filter by Search Query
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        f => f.shortName.toLowerCase().includes(q) || f.fullName.toLowerCase().includes(q)
      );
    }

    // Dynamic Column Sorting
    list.sort((a, b) => {
      let valA: any;
      let valB: any;

      switch (sortField) {
        case 'sno':
          valA = a.id || a.shortName;
          valB = b.id || b.shortName;
          break;
        case 'faculty':
          valA = a.fullName.toLowerCase();
          valB = b.fullName.toLowerCase();
          break;
        case 'shortCode':
          valA = a.shortName.toLowerCase();
          valB = b.shortName.toLowerCase();
          break;
        case 'assignedSections':
          valA = (a.assignedSections || []).join(', ').toLowerCase();
          valB = (b.assignedSections || []).join(', ').toLowerCase();
          break;
        case 'sectionLoad':
          valA = a.calculatedSectionTotal;
          valB = b.calculatedSectionTotal;
          break;
        case 'theory':
          valA = selectedSection !== 'ALL' ? a.sectionTheoryHours : a.overallTheoryHours;
          valB = selectedSection !== 'ALL' ? b.sectionTheoryHours : b.overallTheoryHours;
          break;
        case 'tutorial':
          valA = selectedSection !== 'ALL' ? a.sectionTutorialHours : a.overallTutorialHours;
          valB = selectedSection !== 'ALL' ? b.sectionTutorialHours : b.overallTutorialHours;
          break;
        case 'lab':
          valA = selectedSection !== 'ALL' ? a.sectionLabHours : a.overallLabHours;
          valB = selectedSection !== 'ALL' ? b.sectionLabHours : b.overallLabHours;
          break;
        case 'totalWorkload':
        default:
          valA = a.calculatedOverallTotal;
          valB = b.calculatedOverallTotal;
          break;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    const totalHours = list.reduce((sum, f) => sum + f.calculatedOverallTotal, 0);

    setWorkloadStats({
      activeSection: selectedSection,
      totalFacultyCount: list.length,
      totalCampusWorkloadHours: totalHours,
      highestWorkload: list[0]?.calculatedOverallTotal || 0,
      averageWorkload: Math.round(totalHours / (list.length || 1)),
      facultyList: list,
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadMessage('Parsing Excel workbook in browser...');

    try {
      const data = await file.arrayBuffer();
      const workbook = xlsx.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames.find(n => n.includes('Sheet2')) || workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      if (!sheet) {
        setUploadMessage('Error: Sheet2 not found in uploaded file.');
        setUploading(false);
        return;
      }

      const rows: any[] = xlsx.utils.sheet_to_json(sheet);
      
      const normalizeName = (name: string) => {
        return name.toLowerCase()
          .replace(/^(dr\.|mr\.|mrs\.|ms\.|prof\.)\s*/, '')
          .replace(/santosh/g, 'santhosh')
          .replace(/srinivasa/g, 'srinivas')
          .replace(/\s+/g, '')
          .replace(/[^a-z0-9]/g, '');
      };

      const facultyMap: { [key: string]: any } = {};

      rows.forEach(r => {
        const branch = String(r['Branch'] || '').trim();
        if (!branch) return;

        const subName = String(r['Subject_Name'] || '').trim();
        const subShort = String(r['sub_short'] || subName).trim();
        const theoryHrs = parseFloat(r['Theory_Hours'] || 0);
        const tutHrs = parseFloat(r['Tutorial_Hours'] || 0);
        const freq = parseFloat(r['Frequency'] || 1);
        const labHrs = parseFloat(r['Lab_Hours'] || 0);

        const parsePairs = (shortStr: any, nameStr: any, sessionType: string, hours: number) => {
          if (!shortStr || hours <= 0) return;
          const sList = String(shortStr).split(/[\r\n,\/]+/).map(s => s.trim()).filter(Boolean);
          const nList = nameStr ? String(nameStr).split(/[\r\n,\/]+/).map(s => s.trim()).filter(Boolean) : [];

          sList.forEach((sCode, idx) => {
            const rawFullName = nList[idx] || nList[0] || sCode;
            const normKey = normalizeName(rawFullName);
            const canonicalCode = sCode.replace(/^(Dr\.|Mr\.|Ms\.|Mrs\.)\s*/i, '').trim();

            if (!facultyMap[normKey]) {
              facultyMap[normKey] = {
                id: canonicalCode,
                shortName: canonicalCode,
                fullName: rawFullName,
                department: 'General',
                classes: [],
              };
            }

            const coFacultyList = sList.filter(s => s !== sCode).join(', ');

            facultyMap[normKey].classes.push({
              branch,
              sessionType,
              subjectName: subName,
              subjectShort: subShort,
              hours,
              coFacultyList,
            });
          });
        };

        parsePairs(r.Name_short, r.Faculty_Name, 'Theory', theoryHrs);
        if (labHrs > 0) {
          parsePairs(r.Name_short, r.Faculty_Name, 'Lab', labHrs * freq);
        }
        parsePairs(r.Tutorial_Short, r.Tutorial_Name, 'Tutorial', tutHrs);
      });

      const parsedList = Object.values(facultyMap).map((fac: any) => {
        const secSet = new Set<string>();
        fac.classes.forEach((c: any) => secSet.add(c.branch));
        return {
          ...fac,
          assignedSections: Array.from(secSet).sort(),
        };
      });

      if (parsedList.length > 0) {
        setAllFacultyData(parsedList);
        setUploadMessage(`Success! Excel file parsed in browser. Loaded ${parsedList.length} unique faculty members.`);
      } else {
        setUploadMessage('Parsed Excel workbook, but no valid workload rows found.');
      }
    } catch (err) {
      console.error(err);
      setUploadMessage('Failed to parse uploaded Excel file. Please ensure it matches tt-workload.xlsx format.');
    } finally {
      setUploading(false);
    }
  };

  const [modalActiveTab, setModalActiveTab] = useState<'subjects' | 'sections' | 'schedule'>('subjects');

  const openScheduleModal = (fac: any) => {
    setSectionsModalFaculty(fac);
    setModalActiveTab('schedule');
    setIsSectionsModalOpen(true);
  };

  const openSectionsModal = (fac: any, defaultTab: 'subjects' | 'sections' | 'schedule' = 'subjects') => {
    setSectionsModalFaculty(fac);
    setModalActiveTab(defaultTab);
    setIsSectionsModalOpen(true);
  };

  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 text-slate-900 font-sans">
      
      {/* ================= OFFICIAL UNIVERSITY HEADER ================= */}
      <header className="bg-white border-b-4 border-[#800000] shadow-md print:hidden">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <img
              src="/logo.png"
              alt="GVPIHLR Logo"
              className="h-24 w-auto object-contain flex-shrink-0"
              style={{ maxHeight: '95px', maxWidth: '95px', objectFit: 'contain' }}
            />
            <div>
              <div className="text-xs font-black text-[#0B2545] tracking-widest uppercase mb-0.5">
                GVP – Estd. 1988 | GVPIHLR – Estd. 2026
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#800000] font-heading leading-tight tracking-wide">
                GAYATRI VIDYA PARISHAD
              </h1>
              <h2 className="text-xl sm:text-2xl font-bold text-[#800000] font-heading leading-tight">
                INSTITUTE OF HIGHER LEARNING AND RESEARCH
              </h2>
              <p className="text-sm font-medium text-slate-700 mt-0.5">
                (Deemed to be University under Distinct Category under Section 3 of the UGC Act, 1956)
              </p>
              <p className="text-xs text-slate-500 font-medium">Kommadi, Madhurawada, Visakhapatnam – 530 048, Andhra Pradesh</p>
            </div>
          </div>

          <div className="hidden lg:flex flex-col items-end border-l-2 border-slate-200 pl-6 space-y-2">
            <span className="inline-flex items-center px-4 py-1.5 rounded-full text-xs font-extrabold bg-amber-100 text-[#800000] border border-amber-400 shadow-sm">
              <Sparkles className="w-4 h-4 mr-1.5 text-[#DAA520]" />
              Academic Year 2026–2027
            </span>
            <div className="text-sm font-extrabold text-[#0B2545]">College Management Dashboard</div>
            <button
              onClick={handlePrintReport}
              className="px-3.5 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-slate-900 transition-colors flex items-center gap-1.5 shadow-sm print:hidden"
            >
              <Printer className="w-3.5 h-3.5 text-amber-400" /> Print / Export Report
            </button>
          </div>
        </div>

        {/* Executive Navy Header Bar */}
        <div className="bg-[#0B2545] text-white py-2.5 px-4 shadow-inner">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-[#DAA520]" />
              <span className="text-base font-extrabold tracking-wide uppercase text-white">
                Faculty Workload & Program-Section Analytics Portal
              </span>
            </div>
            <span className="text-xs font-semibold text-amber-300 hidden sm:inline-block">
              Official University Management View
            </span>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="bg-[#0B2545] border-t border-blue-900/80 px-4">
          <div className="max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto">
            <button
              onClick={() => setActiveTab('workload')}
              className={`px-5 py-3 font-extrabold text-sm flex items-center gap-2 border-b-4 transition-all whitespace-nowrap ${
                activeTab === 'workload'
                  ? 'border-[#DAA520] text-amber-300 bg-blue-950/80'
                  : 'border-transparent text-slate-300 hover:text-white hover:bg-blue-900/50'
              }`}
            >
              <Users className="w-4 h-4 text-[#DAA520]" />
              Faculty Workload Analytics
            </button>

            <button
              onClick={() => setActiveTab('section_timetables')}
              className={`px-5 py-3 font-extrabold text-sm flex items-center gap-2 border-b-4 transition-all whitespace-nowrap ${
                activeTab === 'section_timetables'
                  ? 'border-[#DAA520] text-amber-300 bg-blue-950/80'
                  : 'border-transparent text-slate-300 hover:text-white hover:bg-blue-900/50'
              }`}
            >
              <Building2 className="w-4 h-4 text-purple-400" />
              Program Section Timetables
              <span className="ml-1 px-2.5 py-0.5 bg-purple-500 text-slate-950 font-black text-[10px] rounded-full uppercase tracking-wider">NEW</span>
            </button>

            <button
              onClick={() => setActiveTab('subject_workload')}
              className={`px-5 py-3 font-extrabold text-sm flex items-center gap-2 border-b-4 transition-all whitespace-nowrap ${
                activeTab === 'subject_workload'
                  ? 'border-[#DAA520] text-amber-300 bg-blue-950/80'
                  : 'border-transparent text-slate-300 hover:text-white hover:bg-blue-900/50'
              }`}
            >
              <BookOpen className="w-4 h-4 text-blue-400" />
              Subject-Wise Workload Matrix
            </button>

            <button
              onClick={() => setActiveTab('collaboration')}
              className={`px-5 py-3 font-extrabold text-sm flex items-center gap-2 border-b-4 transition-all whitespace-nowrap ${
                activeTab === 'collaboration'
                  ? 'border-[#DAA520] text-amber-300 bg-blue-950/80'
                  : 'border-transparent text-slate-300 hover:text-white hover:bg-blue-900/50'
              }`}
            >
              <Layers className="w-4 h-4 text-emerald-400" />
              Shared / Co-Faculty Collaboration Matrix
            </button>
          </div>
        </div>
      </header>

      {/* ================= MAIN EXECUTIVE CONTAINER ================= */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-8 print:hidden">

        {/* EXECUTIVE KPI SUMMARY CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          
          <div className="bg-white p-6 rounded-2xl border-2 border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-xs font-black text-slate-500 uppercase tracking-wider">Faculty Count</div>
              <div className="text-3xl font-black text-[#800000] mt-1">{workloadStats.totalFacultyCount}</div>
              <div className="text-xs font-bold text-slate-600 mt-1">
                {selectedSection === 'ALL' ? 'Total University Faculty' : `Assigned to ${selectedSection}`}
              </div>
            </div>
            <div className="p-4 bg-red-100 text-[#800000] rounded-2xl border border-red-200 shadow-sm">
              <Users className="w-7 h-7" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border-2 border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-xs font-black text-slate-500 uppercase tracking-wider">Active Section Filter</div>
              <div className="text-2xl font-black text-[#0B2545] mt-1">{selectedSection}</div>
              <div className="text-xs font-bold text-slate-600 mt-1">
                {selectedSection === 'ALL' ? 'Viewing All 12+ Sections' : `Isolated to ${selectedSection}`}
              </div>
            </div>
            <div className="p-4 bg-blue-100 text-[#0B2545] rounded-2xl border border-blue-200 shadow-sm">
              <BookOpen className="w-7 h-7" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border-2 border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-xs font-black text-slate-500 uppercase tracking-wider">Peak Individual Load</div>
              <div className="text-3xl font-black text-amber-700 mt-1">{workloadStats.highestWorkload} <span className="text-sm font-bold">hrs/wk</span></div>
              <div className="text-xs font-bold text-slate-600 mt-1">Max teaching load</div>
            </div>
            <div className="p-4 bg-amber-100 text-amber-800 rounded-2xl border border-amber-300 shadow-sm">
              <Award className="w-7 h-7" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border-2 border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-xs font-black text-slate-500 uppercase tracking-wider">Avg Load / Faculty</div>
              <div className="text-3xl font-black text-emerald-700 mt-1">~{workloadStats.averageWorkload} <span className="text-sm font-bold">hrs/wk</span></div>
              <div className="text-xs font-bold text-slate-600 mt-1">Overall campus average</div>
            </div>
            <div className="p-4 bg-emerald-100 text-emerald-800 rounded-2xl border border-emerald-300 shadow-sm">
              <Clock className="w-7 h-7" />
            </div>
          </div>
        </div>

        {/* EXECUTIVE CONTROL BAR (Section Filter + Department Filter + Tutorial Checkbox + Search) */}
        <div className="bg-white p-6 rounded-2xl border-2 border-slate-200 shadow-md space-y-4">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-5 flex-wrap">
            
            {/* 1. Section Filter Dropdown */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <label className="text-xs font-black uppercase tracking-wider text-[#0B2545] flex items-center gap-2">
                <Filter className="w-4 h-4 text-[#800000]" /> Program / Section Filter:
              </label>
              <select
                value={selectedSection}
                onChange={e => setSelectedSection(e.target.value)}
                className="bg-slate-50 border-2 border-slate-300 text-slate-900 font-extrabold text-sm rounded-xl p-3 min-w-[230px] focus:ring-amber-500 focus:border-amber-500 shadow-sm cursor-pointer"
              >
                {sections.map(sec => (
                  <option key={sec} value={sec}>
                    {sec === 'ALL' ? `🌐 All Program Sections (${allFacultyData.length} Faculty)` : `📘 Section: ${sec}`}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Department Filter Dropdown */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <label className="text-xs font-black uppercase tracking-wider text-[#0B2545] flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#800000]" /> Department Filter:
              </label>
              <select
                value={selectedDepartment}
                onChange={e => setSelectedDepartment(e.target.value)}
                className="bg-slate-50 border-2 border-slate-300 text-slate-900 font-extrabold text-sm rounded-xl p-3 min-w-[220px] focus:ring-amber-500 focus:border-amber-500 shadow-sm cursor-pointer"
              >
                {availableDepartments.map(dept => (
                  <option key={dept} value={dept}>
                    {dept === 'ALL' ? '🏢 All Academic Departments' : `🏛️ ${dept}`}
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Tutorial Hours Checkbox */}
            <div className="flex items-center">
              <label className="inline-flex items-center gap-3 cursor-pointer bg-amber-50 hover:bg-amber-100/80 p-2.5 rounded-xl border-2 border-amber-300 transition-colors shadow-sm">
                <input
                  type="checkbox"
                  checked={includeTutorials}
                  onChange={e => setIncludeTutorials(e.target.checked)}
                  className="w-5 h-5 text-[#800000] rounded focus:ring-amber-500 cursor-pointer accent-[#800000]"
                />
                <div>
                  <span className="text-xs font-extrabold text-[#0B2545] block leading-none">
                    Include Tutorial Hours (+1 hr/wk)
                  </span>
                  <span className="text-[10px] font-bold text-amber-800">
                    {includeTutorials ? '✓ Tutorials included in total workload' : '✕ Tutorials excluded from total workload'}
                  </span>
                </div>
              </label>
            </div>

            {/* 4. Search Bar */}
            <div className="relative w-full lg:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                placeholder="Search faculty code or name..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border-2 border-slate-300 rounded-xl focus:ring-amber-500 focus:border-amber-500 font-bold text-slate-900 shadow-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* SECTION FILTER NOTIFICATION BANNER */}
        {selectedSection !== 'ALL' && (
          <div className="p-5 bg-amber-100/70 border-2 border-amber-300 rounded-2xl flex items-center justify-between text-sm shadow-sm">
            <div className="flex items-center gap-3">
              <BookOpen className="w-6 h-6 text-[#800000]" />
              <span className="text-slate-900 font-medium text-base">
                Filtered view showing <strong>{workloadStats.totalFacultyCount} faculty members</strong> assigned to teach in <strong>Section: {selectedSection}</strong>.
              </span>
            </div>
            <button
              onClick={() => setSelectedSection('ALL')}
              className="text-xs font-black text-[#800000] uppercase tracking-wider underline hover:text-red-950 bg-white px-3 py-1.5 rounded-lg border border-amber-300 shadow-sm"
            >
              Show All Sections
            </button>
          </div>
        )}

        {/* FACULTY WORKLOAD TABLE (HIGH-CONTRAST PRINT-STYLE WEBPAGE DESIGN) */}
        {activeTab === 'workload' && (
          <div className="bg-white rounded-2xl border-4 border-slate-900 shadow-xl overflow-hidden">
            <div className="p-5 bg-slate-900 text-white border-b-4 border-slate-900 flex items-center justify-between">
              <h3 className="text-xl font-extrabold text-amber-300 font-heading flex items-center gap-2">
                <Users className="w-6 h-6 text-amber-400" />
                Official Faculty Workload Breakdown Table
              </h3>
              <span className="text-xs font-black text-slate-900 bg-amber-400 px-3 py-1.5 rounded-lg border border-amber-500 shadow-sm">
                Showing {workloadStats.facultyList.length} Faculty Members
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse border-2 border-black">
                <thead>
                  <tr className="bg-slate-900 text-white text-xs font-black uppercase tracking-wider border-b-2 border-black select-none">
                    <th
                      onClick={() => handleSort('sno')}
                      className="border border-black p-3.5 text-center w-14 cursor-pointer hover:bg-slate-800 transition-colors"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>S.No</span>
                        {sortField === 'sno' ? (
                          sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-amber-400" /> : <ArrowDown className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('faculty')}
                      className="border border-black p-3.5 cursor-pointer hover:bg-slate-800 transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Faculty Member</span>
                        {sortField === 'faculty' ? (
                          sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-amber-400" /> : <ArrowDown className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('shortCode')}
                      className="border border-black p-3.5 text-center w-28 cursor-pointer hover:bg-slate-800 transition-colors"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Short Code</span>
                        {sortField === 'shortCode' ? (
                          sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-amber-400" /> : <ArrowDown className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                        )}
                      </div>
                    </th>
                    {selectedSection === 'ALL' ? (
                      <th
                        onClick={() => handleSort('assignedSections')}
                        className="border border-black p-3.5 text-center cursor-pointer hover:bg-slate-800 transition-colors"
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span>Assigned Sections</span>
                          {sortField === 'assignedSections' ? (
                            sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-amber-400" /> : <ArrowDown className="w-3.5 h-3.5 text-amber-400" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                          )}
                        </div>
                      </th>
                    ) : (
                      <th
                        onClick={() => handleSort('sectionLoad')}
                        className="border border-black p-3.5 text-amber-300 bg-black text-center font-black cursor-pointer hover:bg-slate-900 transition-colors"
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span>Section ({selectedSection}) Load</span>
                          {sortField === 'sectionLoad' ? (
                            sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-amber-400" /> : <ArrowDown className="w-3.5 h-3.5 text-amber-400" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-amber-300 opacity-60" />
                          )}
                        </div>
                      </th>
                    )}
                    <th
                      onClick={() => handleSort('theory')}
                      className="border border-black p-3.5 text-center w-28 cursor-pointer hover:bg-slate-800 transition-colors"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Theory</span>
                        {sortField === 'theory' ? (
                          sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-amber-400" /> : <ArrowDown className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('tutorial')}
                      className="border border-black p-3.5 text-center w-28 cursor-pointer hover:bg-slate-800 transition-colors"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Tutorial</span>
                        {sortField === 'tutorial' ? (
                          sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-amber-400" /> : <ArrowDown className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('lab')}
                      className="border border-black p-3.5 text-center w-28 cursor-pointer hover:bg-slate-800 transition-colors"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Lab</span>
                        {sortField === 'lab' ? (
                          sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-amber-400" /> : <ArrowDown className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('totalWorkload')}
                      className="border border-black p-3.5 text-center w-36 text-amber-300 bg-black font-black cursor-pointer hover:bg-slate-900 transition-colors"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Total Workload</span>
                        {sortField === 'totalWorkload' ? (
                          sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-amber-400" /> : <ArrowDown className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-amber-300 opacity-60" />
                        )}
                      </div>
                    </th>
                    <th className="border border-black p-3.5 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-black text-base font-sans">
                  {workloadStats.facultyList.map((f, idx) => (
                    <tr key={f.id || f.shortName} className="hover:bg-slate-100/90 transition-colors whitespace-nowrap">
                      
                      {/* S.No */}
                      <td className="border border-black p-3.5 text-center font-black text-slate-900 text-sm">
                        {idx + 1}
                      </td>

                      {/* Faculty Full Name */}
                      <td className="border border-black p-3.5 font-black text-slate-900 text-base">
                        {f.fullName}
                      </td>

                      {/* Short Code Badge */}
                      <td className="border border-black p-3.5 text-center">
                        <span className="inline-block px-3 py-1 bg-red-100 text-[#800000] font-black text-sm rounded-lg border border-red-300 shadow-sm">
                          {f.shortName}
                        </span>
                      </td>

                      {/* Assigned Sections (When ALL) OR Section Load (When Section Filter Active) */}
                      {selectedSection === 'ALL' ? (
                        <td className="border border-black p-3 text-center">
                          <div className="flex flex-wrap justify-center gap-1.5 max-w-[260px] mx-auto">
                            {f.assignedSections.map((sec: string, si: number) => (
                              <span
                                key={si}
                                className="px-2.5 py-0.5 bg-blue-100 text-[#0B2545] font-extrabold text-xs rounded-md border border-blue-200 shadow-2xs whitespace-nowrap"
                              >
                                {sec}
                              </span>
                            ))}
                          </div>
                        </td>
                      ) : (
                        <td className="border border-black p-3.5 bg-amber-100/90 font-black text-black text-center border-x border-amber-300">
                          <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-black bg-amber-300 text-amber-950 border border-amber-500 shadow-sm">
                            {f.calculatedSectionTotal} hrs/wk
                          </span>
                        </td>
                      )}

                      {/* Theory Hours Column */}
                      <td className="border border-black p-3.5 text-center font-black text-emerald-900 text-base">
                        {selectedSection !== 'ALL' ? f.sectionTheoryHours : f.overallTheoryHours} <span className="text-xs font-bold text-slate-600">hrs</span>
                      </td>

                      {/* Tutorial Hours Column */}
                      <td className={`border border-black p-3.5 text-center font-black text-base ${includeTutorials ? 'text-blue-900' : 'text-slate-400 line-through'}`}>
                        {includeTutorials ? (selectedSection !== 'ALL' ? f.sectionTutorialHours : f.overallTutorialHours) : 0} <span className="text-xs font-bold text-slate-600">hrs</span>
                      </td>

                      {/* Lab Hours Column */}
                      <td className="border border-black p-3.5 text-center font-black text-amber-900 text-base">
                        {selectedSection !== 'ALL' ? f.sectionLabHours : f.overallLabHours} <span className="text-xs font-bold text-slate-600">hrs</span>
                      </td>

                      {/* Overall Total Workload */}
                      <td className="border border-black p-3.5 text-center font-black text-[#800000] text-lg bg-amber-50">
                        {f.calculatedOverallTotal} <span className="text-xs font-bold text-slate-600">hrs/wk</span>
                      </td>

                      {/* View Schedule Action Button */}
                      <td className="border border-black p-3.5 text-center">
                        <button
                          onClick={() => openSectionsModal(f, 'subjects')}
                          className="px-4 py-2 bg-[#0B2545] hover:bg-[#800000] text-white text-xs font-black rounded-xl transition-colors inline-flex items-center gap-1.5 shadow-sm"
                        >
                          <Layers className="w-4 h-4 text-[#DAA520]" />
                          View Workload & Schedule
                          <ChevronRight className="w-4 h-4 text-[#DAA520]" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PROGRAM SECTION TIMETABLES VIEW (EXCEL-STYLE SECTION MASTER SCHEDULES) */}
        {activeTab === 'section_timetables' && (() => {
          const availableSecs = Object.keys(sectionMasterTimetables).sort();
          const activeSec = availableSecs.includes(selectedTimetableSection)
            ? selectedTimetableSection
            : (availableSecs[0] || 'CSE-1');
          
          let secRows = sectionMasterTimetables[activeSec] || [];
          if (sectionSearchQuery && sectionSearchQuery.trim()) {
            const q = sectionSearchQuery.toLowerCase().trim();
            secRows = secRows.filter((r: any) =>
              r.subjectName.toLowerCase().includes(q) ||
              r.subjectShort.toLowerCase().includes(q) ||
              r.facultyList.some((f: any) => f.fullName.toLowerCase().includes(q) || f.shortName.toLowerCase().includes(q))
            );
          }

          if (selectedDepartment && selectedDepartment !== 'ALL') {
            secRows = secRows.filter((r: any) =>
              r.facultyList.some((f: any) => {
                const fullFac = allFacultyData.find(fac => fac.shortName === f.shortName || fac.fullName === f.fullName);
                return fullFac ? (fullFac.department || inferDepartment(fullFac)) === selectedDepartment : false;
              })
            );
          }

          const secTheoryTotal = secRows.reduce((sum: number, r: any) => sum + (r.theoryHours || 0), 0);
          const secTutTotal = secRows.reduce((sum: number, r: any) => sum + (includeTutorials ? (r.tutorialHours || 0) : 0), 0);
          const secLabTotal = secRows.reduce((sum: number, r: any) => sum + (r.labHours || 0), 0);
          const secTotalHours = secTheoryTotal + secTutTotal + secLabTotal;

          return (
            <div className="space-y-8">
              {/* Controls Bar */}
              <div className="bg-white p-6 rounded-2xl border-2 border-slate-200 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <label className="text-xs font-black uppercase tracking-wider text-[#0B2545] flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-[#800000]" /> Select Section Timetable:
                  </label>
                  <select
                    value={activeSec}
                    onChange={e => setSelectedTimetableSection(e.target.value)}
                    className="bg-slate-50 border-2 border-slate-300 text-slate-900 font-extrabold text-base rounded-xl p-3 min-w-[220px] focus:ring-amber-500 focus:border-amber-500 shadow-sm cursor-pointer"
                  >
                    {availableSecs.map(s => (
                      <option key={s} value={s}>
                        📘 Section: {s}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Section Stats KPI */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="px-3.5 py-1.5 bg-emerald-100 text-emerald-900 font-black text-xs rounded-xl border border-emerald-300">
                    Theory: {secTheoryTotal}h
                  </span>
                  <span className={`px-3.5 py-1.5 font-black text-xs rounded-xl border ${includeTutorials ? 'bg-blue-100 text-blue-900 border-blue-300' : 'bg-slate-100 text-slate-400 border-slate-300 line-through'}`}>
                    Tut: {secTutTotal}h
                  </span>
                  <span className="px-3.5 py-1.5 bg-amber-100 text-amber-900 font-black text-xs rounded-xl border border-amber-300">
                    Lab: {secLabTotal}h
                  </span>
                  <span className="px-4 py-1.5 bg-[#800000] text-white font-black text-sm rounded-xl border border-red-900 shadow-sm">
                    Section Total: {secTotalHours} hrs/wk
                  </span>
                </div>

                {/* Search Bar for Section Courses */}
                <div className="relative w-full md:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    placeholder="Search subject or faculty..."
                    value={sectionSearchQuery}
                    onChange={e => setSectionSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-2 border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:ring-amber-500 focus:border-amber-500"
                  />
                  {sectionSearchQuery && (
                    <button
                      onClick={() => setSectionSearchQuery('')}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 p-0.5"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Master Section Timetable Sheet (Exact Excel Format Matching Screenshot 2) */}
              <div className="bg-white rounded-2xl border-4 border-slate-900 shadow-xl overflow-hidden">
                <div className="p-5 bg-slate-900 text-white border-b-4 border-slate-900 flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-extrabold text-amber-300 font-heading flex items-center gap-2">
                      <Building2 className="w-6 h-6 text-amber-400" />
                      Master Section Timetable Sheet — {activeSec}
                    </h3>
                    <p className="text-xs text-slate-300 font-medium mt-0.5">
                      Excel Columns: Branch | Room_no | Subject_Name | sub_short | Theory_Hours | Tutorial_Hours | Frequency | Lab_Hours | Name_short | Faculty_Name
                    </p>
                  </div>
                  <span className="text-xs font-black text-slate-900 bg-amber-400 px-3 py-1.5 rounded-lg border border-amber-500 shadow-sm">
                    {secRows.length} Course Assignments
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse border-2 border-black text-sm font-sans">
                    <thead>
                      <tr className="bg-slate-900 text-white text-xs font-black uppercase tracking-wider border-b-2 border-black">
                        <th className="border border-black p-3.5 text-center italic font-serif">Branch</th>
                        <th className="border border-black p-3.5 text-center italic font-serif">Room_no</th>
                        <th className="border border-black p-3.5 italic font-serif">Subject_Name</th>
                        <th className="border border-black p-3.5 text-center italic font-serif">sub_short</th>
                        <th className="border border-black p-3.5 text-center italic font-serif">Theory_Hours</th>
                        <th className="border border-black p-3.5 text-center italic font-serif">Tutorial_Hours</th>
                        <th className="border border-black p-3.5 text-center italic font-serif">Frequency</th>
                        <th className="border border-black p-3.5 text-center italic font-serif">Lab_Hours</th>
                        <th className="border border-black p-3.5 text-left italic font-serif">Name_short</th>
                        <th className="border border-black p-3.5 text-left italic font-serif">Faculty_Name</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y-2 divide-black text-sm">
                      {secRows.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="p-8 text-center text-slate-500 font-bold">
                            No timetable assignments found for section {activeSec}.
                          </td>
                        </tr>
                      ) : (
                        secRows.map((row: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-100/90 transition-colors">
                            {/* Branch */}
                            <td className="border border-black p-3 text-center font-black">
                              <span className="px-2.5 py-1 bg-blue-100 text-[#0B2545] rounded-lg border border-blue-300 font-extrabold text-xs">
                                {row.branch}
                              </span>
                            </td>

                            {/* Room_no */}
                            <td className="border border-black p-3 text-center font-bold text-slate-700">{row.roomNo}</td>

                            {/* Subject_Name */}
                            <td className="border border-black p-3 font-black text-slate-900 text-base">{row.subjectName}</td>

                            {/* sub_short */}
                            <td className="border border-black p-3 text-center font-black text-[#800000]">
                              <span className="px-2.5 py-1 bg-red-50 text-[#800000] rounded-md border border-red-200 font-black text-xs">
                                {row.subjectShort}
                              </span>
                            </td>

                            {/* Theory_Hours */}
                            <td className="border border-black p-3 text-center font-black text-emerald-900 text-base">
                              {row.theoryHours || ''}
                            </td>

                            {/* Tutorial_Hours */}
                            <td className={`border border-black p-3 text-center font-black text-base ${includeTutorials ? 'text-blue-900' : 'text-slate-400 line-through'}`}>
                              {includeTutorials ? (row.tutorialHours || '') : ''}
                            </td>

                            {/* Frequency */}
                            <td className="border border-black p-3 text-center font-extrabold text-slate-800 text-sm">
                              {row.frequency || 1}
                            </td>

                            {/* Lab_Hours */}
                            <td className="border border-black p-3 text-center font-black text-amber-900 text-base">
                              {row.labHours || ''}
                            </td>

                            {/* Name_short (Stacked line by line matching Column I in screenshot) */}
                            <td className="border border-black p-3 text-left font-black bg-amber-50/50">
                              <div className="space-y-1">
                                {row.facultyList.map((f: any, fi: number) => (
                                  <div key={fi} className="text-xs font-black text-[#800000] tracking-wide whitespace-nowrap">
                                    {f.shortName}
                                  </div>
                                ))}
                              </div>
                            </td>

                            {/* Faculty_Name (Stacked line by line matching Column J in screenshot) */}
                            <td className="border border-black p-3 text-left font-extrabold">
                              <div className="space-y-1">
                                {row.facultyList.map((f: any, fi: number) => (
                                  <div key={fi} className="text-xs font-bold text-slate-900 whitespace-nowrap">
                                    {f.fullName}
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })()}

        {/* SUBJECT-WISE WORKLOAD MATRIX VIEW */}
        {activeTab === 'subject_workload' && (
          <div className="space-y-8">
            {/* Search Header for Subjects */}
            <div className="bg-white p-5 rounded-2xl border-2 border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-extrabold text-[#0B2545] font-heading flex items-center gap-2">
                  <BookOpen className="w-6 h-6 text-[#800000]" />
                  Campus-Wide Subject Workload Breakdown
                </h3>
                <p className="text-xs text-slate-600 font-bold mt-1">
                  Master breakdown of total hours taught per subject across all branches, sections, and faculty members.
                </p>
              </div>

              <div className="relative w-full md:w-80">
                <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search subject by name or code..."
                  value={subjectSearchQuery}
                  onChange={(e) => setSubjectSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border-2 border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:border-[#0B2545]"
                />
              </div>
            </div>

            {/* Subject Master Table */}
            <div className="bg-white rounded-2xl border-4 border-slate-900 shadow-xl overflow-hidden">
              <div className="p-5 bg-slate-900 text-white border-b-4 border-slate-900 flex items-center justify-between">
                <h3 className="text-xl font-extrabold text-amber-300 font-heading flex items-center gap-2">
                  <BookOpen className="w-6 h-6 text-amber-400" />
                  Official Subject-Wise Workload Table
                </h3>
                <span className="text-xs font-black text-slate-900 bg-amber-400 px-3 py-1.5 rounded-lg border border-amber-500 shadow-sm">
                  Showing {subjectMasterData.list.filter(s => 
                    !subjectSearchQuery || 
                    s.subjectName.toLowerCase().includes(subjectSearchQuery.toLowerCase()) || 
                    s.subjectShort.toLowerCase().includes(subjectSearchQuery.toLowerCase())
                  ).length} Subjects
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse border-2 border-black">
                  <thead>
                    <tr className="bg-slate-900 text-white text-xs font-black uppercase tracking-wider border-b-2 border-black">
                      <th className="border border-black p-4 w-12 text-center">S.No</th>
                      <th className="border border-black p-4">Subject Name & Code</th>
                      <th className="border border-black p-4 text-center">Campus Total Load</th>
                      <th className="border border-black p-4 text-center">Theory / Tut / Lab Breakdown</th>
                      <th className="border border-black p-4 text-center">Sections Offered</th>
                      <th className="border border-black p-4">Assigned Faculty Members & Load</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-black text-base font-sans">
                    {subjectMasterData.list
                      .filter(s => 
                        !subjectSearchQuery || 
                        s.subjectName.toLowerCase().includes(subjectSearchQuery.toLowerCase()) || 
                        s.subjectShort.toLowerCase().includes(subjectSearchQuery.toLowerCase())
                      )
                      .map((sub, sIdx) => (
                        <tr key={sIdx} className="hover:bg-slate-100/90 transition-colors">
                          <td className="border border-black p-4 text-center font-black text-slate-900">
                            {sIdx + 1}
                          </td>

                          {/* Subject Name & Short Code */}
                          <td className="border border-black p-4">
                            <div className="font-black text-slate-900 text-base">
                              {sub.subjectName}
                            </div>
                            {sub.subjectShort && (
                              <span className="inline-block mt-1 px-2.5 py-0.5 bg-blue-100 text-blue-900 font-black text-xs rounded border border-blue-300">
                                Code: {sub.subjectShort}
                              </span>
                            )}
                          </td>

                          {/* Total Hours */}
                          <td className="border border-black p-4 text-center font-black text-[#800000] text-lg bg-amber-50">
                            {sub.totalHours} <span className="text-xs font-bold text-slate-600">hrs/wk</span>
                          </td>

                          {/* Breakdown */}
                          <td className="border border-black p-4 text-center text-xs font-bold text-slate-800">
                            <span className="text-emerald-900 font-extrabold text-sm">{sub.theoryHours}h</span> Theory |{' '}
                            <span className={`font-extrabold text-sm ${includeTutorials ? 'text-blue-900' : 'text-slate-400 line-through'}`}>
                              {sub.tutHours}h
                            </span> Tut |{' '}
                            <span className="text-amber-900 font-extrabold text-sm">{sub.labHours}h</span> Lab
                          </td>

                          {/* Sections Offered */}
                          <td className="border border-black p-4 text-center">
                            <div className="flex flex-wrap justify-center gap-1">
                              {sub.sectionsList.map((sec, secI) => (
                                <span key={secI} className="px-2 py-0.5 bg-[#0B2545] text-white font-extrabold text-xs rounded">
                                  {sec}
                                </span>
                              ))}
                            </div>
                          </td>

                          {/* Assigned Faculty */}
                          <td className="border border-black p-4">
                            <div className="flex flex-wrap gap-1.5">
                              {sub.assignedFaculty.map((facItem, fI) => (
                                <span key={fI} className="px-2.5 py-1 bg-red-100 text-[#800000] font-black text-xs rounded-lg border border-red-300 flex items-center gap-1 shadow-sm">
                                  <span>{facItem.shortName}</span>
                                  <span className="bg-[#800000] text-white px-1.5 py-0.5 rounded text-[10px] font-black">{facItem.hours}h</span>
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SHARED / CO-FACULTY COLLABORATION MATRIX VIEW */}
        {activeTab === 'collaboration' && (
          <div className="space-y-8">
            {/* KPI Summary Banner */}
            <div className="bg-[#0B2545] text-white p-6 rounded-2xl shadow-lg border-2 border-blue-900 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-blue-800 pb-4">
                <div>
                  <h3 className="text-xl font-extrabold text-amber-300 font-heading flex items-center gap-2">
                    <Layers className="w-6 h-6 text-amber-400" />
                    Shared / Co-Faculty Collaboration Matrix
                  </h3>
                  <p className="text-xs text-slate-300 font-medium mt-1">
                    Analyzing courses co-taught by multiple faculty members (Labs & Theory) and mapping faculty teaching partner networks.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-4 py-2 bg-amber-400/20 text-amber-300 font-extrabold text-xs rounded-xl border border-amber-400/40">
                    {collaborationMatrixData.totalSharedCoursesCount} Shared Course Sessions
                  </span>
                  <span className="px-4 py-2 bg-emerald-400/20 text-emerald-300 font-extrabold text-xs rounded-xl border border-emerald-400/40">
                    {collaborationMatrixData.collaboratingFacultyCount} Collaborating Faculty
                  </span>
                </div>
              </div>
            </div>

            {/* Section 1: Multi-Faculty Shared Courses Table */}
            <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-md overflow-hidden">
              <div className="p-5 bg-slate-100 border-b-2 border-slate-200 flex items-center justify-between">
                <h4 className="text-base font-extrabold text-[#800000] font-heading flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-[#800000]" />
                  Multi-Faculty Shared Courses & Assigned Teams
                </h4>
                <span className="text-xs font-bold text-slate-600 bg-white px-3 py-1 rounded-lg border border-slate-300">
                  Showing {collaborationMatrixData.coursesList.length} Shared Courses
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-[#0B2545] text-white text-xs font-black uppercase tracking-wider">
                      <th className="p-4">Subject Name & Code</th>
                      <th className="p-4">Program / Section</th>
                      <th className="p-4">Session Type</th>
                      <th className="p-4">Hours/Wk</th>
                      <th className="p-4">Co-Assigned Faculty Team</th>
                      <th className="p-4 text-center">Team Size</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-slate-100">
                    {collaborationMatrixData.coursesList.map((course: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4">
                          <div className="font-extrabold text-slate-900 text-base">{course.subjectName}</div>
                          <div className="text-xs font-bold text-slate-500">{course.subjectShort}</div>
                        </td>
                        <td className="p-4 font-black text-[#0B2545]">
                          <span className="px-3 py-1 bg-blue-100 text-[#0B2545] font-extrabold text-xs rounded-lg border border-blue-200">
                            {course.branch}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 text-xs font-extrabold rounded-md ${
                            course.sessionType === 'Lab' ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                          }`}>
                            {course.sessionType}
                          </span>
                        </td>
                        <td className="p-4 font-black text-[#800000] text-base">
                          {course.hours} hrs
                        </td>
                        <td className="p-4">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {course.allFacultyList.map((facCode: string, fi: number) => (
                              <span
                                key={fi}
                                className={`px-2.5 py-1 text-xs font-extrabold rounded-lg shadow-sm border ${
                                  fi === 0
                                    ? 'bg-[#800000] text-white border-red-900'
                                    : 'bg-amber-100 text-amber-950 border-amber-300'
                                }`}
                              >
                                {facCode} {fi === 0 ? '(Lead)' : ''}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-4 text-center font-black text-[#0B2545]">
                          <span className="inline-block px-3 py-1 bg-slate-100 rounded-full border border-slate-300">
                            {course.allFacultyList.length} Faculty
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 2: Faculty Partner Network */}
            <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-md overflow-hidden">
              <div className="p-5 bg-slate-100 border-b-2 border-slate-200">
                <h4 className="text-base font-extrabold text-[#0B2545] font-heading flex items-center gap-2">
                  <Users className="w-5 h-5 text-[#0B2545]" />
                  Faculty Co-Teaching Partner Network
                </h4>
                <p className="text-xs text-slate-500 font-bold mt-0.5">
                  Shows all faculty members who share teaching duties with other colleagues.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-800 text-white text-xs font-black uppercase tracking-wider">
                      <th className="p-4">Faculty Member</th>
                      <th className="p-4">Code</th>
                      <th className="p-4">Shared Classes Count</th>
                      <th className="p-4">Co-Teaching Partners</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-slate-100">
                    {collaborationMatrixData.networkList.map((net: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 font-black text-slate-900 text-base">{net.facultyName}</td>
                        <td className="p-4 font-extrabold text-[#800000]">
                          <span className="px-2.5 py-1 bg-red-100 text-[#800000] rounded-md font-extrabold text-xs">
                            {net.shortCode}
                          </span>
                        </td>
                        <td className="p-4 font-black text-[#0B2545]">
                          {net.sharedClassesCount} Shared Classes
                        </td>
                        <td className="p-4">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {net.partnersList.map((pCode: string, pi: number) => (
                              <span key={pi} className="px-2.5 py-1 bg-blue-100 text-[#0B2545] text-xs font-extrabold rounded-md border border-blue-300">
                                {pCode}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* EXCEL DRAG & DROP UPLOAD CARD */}
        <div className="bg-white p-6 rounded-2xl border-2 border-slate-200 shadow-md space-y-4 print:hidden">
          <h3 className="text-lg font-extrabold text-[#800000] font-heading flex items-center gap-2">
            <Upload className="w-6 h-6 text-[#800000]" />
            Upload Updated Excel Workbook (`Sheet2`)
          </h3>
          <p className="text-sm font-medium text-slate-600">
            Upload any new Excel workbook formatted like <code className="bg-slate-100 text-red-700 px-1.5 py-0.5 rounded font-mono font-bold">tt-workload.xlsx</code>. The system automatically extracts theory, tutorial, and lab assignments per section and recalculates workload statistics instantly.
          </p>

          <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center bg-slate-50 hover:bg-slate-100/80 transition-colors cursor-pointer relative">
            <input
              type="file"
              accept=".xlsx, .xls"
              onChange={handleFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <FileSpreadsheet className="w-12 h-12 text-[#0B2545] mx-auto mb-3" />
            <div className="text-base font-extrabold text-[#0B2545]">Drop Excel file here or click to browse</div>
            <div className="text-xs font-semibold text-slate-500 mt-1">Supports tt-workload.xlsx formatted workbooks</div>
          </div>

          {uploading && (
            <div className="p-4 bg-amber-50 text-amber-900 rounded-xl text-sm font-bold flex items-center gap-3 border border-amber-300">
              <RefreshCw className="w-5 h-5 animate-spin text-[#DAA520]" />
              {uploadMessage}
            </div>
          )}

          {uploadMessage && !uploading && (
            <div className="p-4 bg-blue-50 text-[#0B2545] rounded-xl text-sm font-bold flex items-center gap-3 border border-blue-300">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              {uploadMessage}
            </div>
          )}
        </div>
      </main>

      {/* ================= UNIFIED FACULTY WORKLOAD & BREAKDOWN POPUP MODAL ================= */}
      {isSectionsModalOpen && sectionsModalFaculty && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-7 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto border-4 border-[#0B2545]">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b-2 pb-4 border-slate-200">
              <div>
                <div className="text-xs font-black text-[#800000] uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-[#800000]" /> Detailed Teaching Assignment & Workload Analysis
                </div>
                <h3 className="text-2xl font-extrabold text-slate-900 font-heading">
                  {sectionsModalFaculty.fullName}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="px-2.5 py-0.5 bg-red-100 text-[#800000] font-black text-xs rounded border border-red-200">
                    Code: {sectionsModalFaculty.shortName}
                  </span>
                  <span className="text-xs font-bold text-slate-500">
                    • Total Workload: <strong className="text-[#0B2545] text-sm">{sectionsModalFaculty.calculatedOverallTotal} hrs/wk</strong>
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsSectionsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Total Workload Header Summary Cards */}
            <div className="grid grid-cols-3 gap-3 p-3 bg-slate-100 rounded-2xl border border-slate-200 text-center">
              <div>
                <div className="text-[11px] font-bold text-slate-500 uppercase">Overall Workload</div>
                <div className="text-xl font-black text-[#0B2545] mt-0.5">
                  {sectionsModalFaculty.calculatedOverallTotal} hrs/wk
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-slate-500 uppercase">Assigned Subjects</div>
                <div className="text-xl font-black text-blue-900 mt-0.5">
                  {sectionsModalFaculty.subjectBreakdownList?.length || 0} Subjects
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-slate-500 uppercase">Assigned Sections</div>
                <div className="text-xl font-black text-[#800000] mt-0.5">
                  {sectionsModalFaculty.assignedSections?.length || 0} Sections
                </div>
              </div>
            </div>

            {/* Modal Sub-Navigation Tabs */}
            <div className="flex items-center gap-2 border-b-2 border-slate-200 pb-2 overflow-x-auto">
              <button
                onClick={() => setModalActiveTab('subjects')}
                className={`px-4 py-2.5 rounded-xl font-extrabold text-xs flex items-center gap-2 transition-all whitespace-nowrap ${
                  modalActiveTab === 'subjects'
                    ? 'bg-[#0B2545] text-amber-300 shadow-md ring-2 ring-blue-900'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <BookOpen className="w-4 h-4 text-amber-400" />
                Assigned Subjects ({sectionsModalFaculty.subjectBreakdownList?.length || 0})
              </button>

              <button
                onClick={() => setModalActiveTab('sections')}
                className={`px-4 py-2.5 rounded-xl font-extrabold text-xs flex items-center gap-2 transition-all whitespace-nowrap ${
                  modalActiveTab === 'sections'
                    ? 'bg-[#800000] text-amber-300 shadow-md ring-2 ring-red-900'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Layers className="w-4 h-4 text-amber-400" />
                Assigned Sections ({sectionsModalFaculty.assignedSections?.length || 0})
              </button>

              <button
                onClick={() => setModalActiveTab('schedule')}
                className={`px-4 py-2.5 rounded-xl font-extrabold text-xs flex items-center gap-2 transition-all whitespace-nowrap ${
                  modalActiveTab === 'schedule'
                    ? 'bg-slate-900 text-white shadow-md ring-2 ring-slate-700'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Clock className="w-4 h-4 text-amber-400" />
                Class Schedule ({sectionsModalFaculty.classes?.length || 0} Sessions)
              </button>
            </div>

            {/* TAB 1: ASSIGNED SUBJECTS BREAKDOWN */}
            {modalActiveTab === 'subjects' && (
              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-600">
                  Aggregated workload breakdown per subject taught across program sections:
                </div>
                
                <div className="space-y-3">
                  {sectionsModalFaculty.subjectBreakdownList?.map((subItem: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-4 rounded-2xl border-2 border-blue-200 bg-blue-50/40 hover:bg-blue-50 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-3 py-1 bg-[#0B2545] text-white font-extrabold text-sm rounded-lg shadow-sm">
                            {subItem.subjectName}
                          </span>
                          {subItem.subjectShort && (
                            <span className="px-2.5 py-0.5 bg-blue-200 text-blue-950 font-black text-xs rounded-md border border-blue-300">
                              Code: {subItem.subjectShort}
                            </span>
                          )}
                        </div>

                        {/* Hours Breakdown */}
                        <div className="text-xs font-bold text-slate-700 flex items-center gap-3">
                          <span>Theory: <strong className="text-emerald-800">{subItem.theoryHours} hrs/wk</strong></span>
                          <span>•</span>
                          <span>Tutorial: <strong className={includeTutorials ? 'text-blue-800' : 'text-slate-400 line-through'}>{subItem.tutHours} hrs/wk</strong></span>
                          <span>•</span>
                          <span>Lab: <strong className="text-amber-800">{subItem.labHours} hrs/wk</strong></span>
                        </div>

                        {/* Sections taught */}
                        <div className="flex items-center gap-1.5 flex-wrap pt-1">
                          <span className="text-xs font-bold text-slate-500">Taught in Sections ({subItem.sections.length}):</span>
                          {subItem.sections.map((sec: string, si: number) => (
                            <span key={si} className="px-2.5 py-0.5 bg-white text-slate-900 font-extrabold text-xs rounded border border-slate-300 shadow-sm">
                              {sec}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Workload Pill */}
                      <div className="text-right flex-shrink-0 bg-white p-3 rounded-xl border border-blue-200 shadow-sm">
                        <div className="text-[10px] font-extrabold text-slate-500 uppercase">Subject Load</div>
                        <span className="text-2xl font-black text-[#800000]">
                          {subItem.totalHours} <span className="text-xs font-bold text-slate-600">hrs/wk</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 2: ASSIGNED SECTIONS BREAKDOWN */}
            {modalActiveTab === 'sections' && (
              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-600">
                  Detailed workload breakdown per assigned program section:
                </div>
                
                <div className="space-y-3">
                  {sectionsModalFaculty.sectionBreakdownList?.map((secItem: any, idx: number) => {
                    const isCurrentFilter = selectedSection !== 'ALL' && secItem.sectionName === selectedSection;

                    return (
                      <div
                        key={idx}
                        className={`p-4 rounded-2xl border-2 flex items-center justify-between transition-all ${
                          isCurrentFilter
                            ? 'bg-amber-100/90 border-amber-500 shadow-md ring-2 ring-amber-300'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <div className="space-y-1.5 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`px-3 py-1 font-extrabold text-sm rounded-lg ${
                              isCurrentFilter ? 'bg-[#800000] text-white' : 'bg-[#0B2545] text-white'
                            }`}>
                              Section: {secItem.sectionName}
                            </span>
                            {isCurrentFilter && (
                              <span className="text-xs font-bold px-2.5 py-0.5 bg-amber-200 text-amber-950 rounded-md border border-amber-400">
                                Selected Filter
                              </span>
                            )}
                          </div>

                          {/* Subjects taught in this section */}
                          <div className="text-xs font-bold text-slate-700 pt-1 space-y-1">
                            {secItem.classes.map((cls: any, ci: number) => (
                              <div key={ci} className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded-md border border-slate-200">
                                <span className="text-slate-900 font-extrabold">• {cls.subjectName} ({cls.subjectShort})</span>
                                <span className="text-slate-500 font-semibold">[{cls.sessionType}]</span>
                                <span className="text-[#800000] font-black">({cls.effectiveHours} hrs/wk)</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Workload Pill */}
                        <div className="text-right flex-shrink-0 bg-white p-3 rounded-xl border border-slate-200 shadow-sm ml-4">
                          <div className="text-[10px] font-extrabold text-slate-500 uppercase">Section Load</div>
                          <span className="text-2xl font-black text-[#800000]">
                            {secItem.totalHours} <span className="text-xs font-bold text-slate-600">hrs/wk</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 3: CLASS SCHEDULE */}
            {modalActiveTab === 'schedule' && (
              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-600">
                  Complete list of assigned weekly teaching sessions and time slots:
                </div>
                
                <div className="overflow-x-auto rounded-xl border-2 border-slate-200">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#0B2545] text-white font-extrabold">
                        <th className="p-3">Program / Section</th>
                        <th className="p-3">Subject Name</th>
                        <th className="p-3">Code</th>
                        <th className="p-3">Type</th>
                        <th className="p-3 text-center">Weekly Load</th>
                        <th className="p-3">Co-Faculty List</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-medium">
                      {sectionsModalFaculty.classes?.map((c: any, ci: number) => (
                        <tr key={ci} className="hover:bg-slate-50">
                          <td className="p-3 font-extrabold text-[#0B2545]">{c.branch}</td>
                          <td className="p-3 font-extrabold text-slate-900">{c.subjectName}</td>
                          <td className="p-3 text-slate-600 font-bold">{c.subjectShort}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded font-bold ${
                              c.sessionType === 'Lab' ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                            }`}>
                              {c.sessionType}
                            </span>
                          </td>
                          <td className="p-3 text-center font-black text-[#800000]">{c.hours} hrs/wk</td>
                          <td className="p-3 text-slate-500 font-medium">{c.coFacultyList || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
              <div className="text-xs text-slate-500 font-medium hidden sm:block">
                Switch view: <strong className="text-slate-800">Subjects</strong>, <strong className="text-slate-800">Sections</strong>, or <strong className="text-slate-800">Schedule</strong> tabs above.
              </div>
              <button
                onClick={() => setIsSectionsModalOpen(false)}
                className="px-5 py-2.5 bg-[#0B2545] text-white font-bold text-sm rounded-xl hover:bg-[#800000] shadow-sm transition-colors ml-auto"
              >
                Close Modal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= FOOTER ================= */}
      <footer className="bg-[#0B2545] text-slate-300 text-xs py-5 border-t-4 border-[#DAA520] print:hidden">
        <div className="max-w-7xl mx-auto px-4 text-center space-y-1">
          <p className="font-bold text-white text-sm">GAYATRI VIDYA PARISHAD INSTITUTE OF HIGHER LEARNING AND RESEARCH</p>
          <p className="text-slate-300">Official College Management Portal | Faculty Workload & Section Analytics</p>
        </div>
      </footer>

      {/* ================= DEDICATED PRINT-ONLY OFFICIAL REPORT ================= */}
      <div className="hidden print:block w-full text-black font-sans leading-tight bg-white p-2">
        {/* Institutional Print Header */}
        <div className="border-b-4 border-black pb-4 mb-4">
          <div className="flex items-center justify-between gap-4">
            <img
              src="/logo.png"
              alt="GVPIHLR Emblem"
              className="h-20 w-auto object-contain flex-shrink-0"
            />
            <div className="text-center flex-1">
              <div className="text-xs font-black tracking-widest uppercase text-slate-800">
                GVP – Estd. 1988 | GVPIHLR – Estd. 2026
              </div>
              <h1 className="text-2xl font-black text-black tracking-wide uppercase font-serif">
                GAYATRI VIDYA PARISHAD
              </h1>
              <h2 className="text-xl font-extrabold text-black uppercase font-serif">
                INSTITUTE OF HIGHER LEARNING AND RESEARCH
              </h2>
              <p className="text-xs font-bold text-slate-700">
                (Deemed to be University under Distinct Category under Section 3 of the UGC Act, 1956)
              </p>
              <p className="text-[11px] text-slate-600 font-semibold">
                Kommadi, Madhurawada, Visakhapatnam – 530 048, Andhra Pradesh
              </p>
            </div>
            <div className="text-right text-xs font-bold border-l-2 border-black pl-3 space-y-1">
              <div>Academic Year: 2026-2027</div>
              <div>Date: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
              <div className="text-[10px] uppercase font-black bg-slate-200 px-2 py-0.5 border border-black rounded inline-block">
                Official Record
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2 border-t-2 border-black text-center bg-slate-100 py-2 border-b-2 border-black">
            <h3 className="text-xl font-black uppercase tracking-wider text-black">
              OFFICIAL FACULTY WORKLOAD STATEMENT
            </h3>
            <div className="flex items-center justify-center gap-6 text-xs font-bold text-slate-900 mt-1">
              <span>Filter: <strong className="text-black">{selectedSection === 'ALL' ? 'ALL PROGRAM SECTIONS (UNIVERSITY WIDE)' : `SECTION ${selectedSection}`}</strong></span>
              <span>•</span>
              <span>Tutorial Hours: <strong className="text-black">{includeTutorials ? 'INCLUDED (+1 hr/wk)' : 'EXCLUDED'}</strong></span>
              <span>•</span>
              <span>Faculty Count: <strong className="text-black">{workloadStats.totalFacultyCount} Members</strong></span>
            </div>
          </div>
        </div>

        {/* Excel/Word Style High Contrast Dark Border Table */}
        <table className="w-full border-collapse border-2 border-black text-xs">
          <thead>
            <tr className="bg-slate-900 text-white font-black uppercase border-b-2 border-black text-sm">
              <th className="border border-black p-2.5 text-center w-12">S.No</th>
              <th className="border border-black p-2.5 text-left">Faculty Name</th>
              <th className="border border-black p-2.5 text-center w-20">Code</th>
              {selectedSection !== 'ALL' && (
                <th className="border border-black p-2.5 text-center bg-black text-amber-300 font-black">
                  Section ({selectedSection}) Load
                </th>
              )}
              <th className="border border-black p-2.5 text-center w-20">Theory</th>
              <th className="border border-black p-2.5 text-center w-20">Tutorial</th>
              <th className="border border-black p-2.5 text-center w-20">Lab</th>
              <th className="border border-black p-2.5 text-center font-black w-28 text-amber-300 bg-black">Total Workload</th>
              <th className="border border-black p-2.5 text-left">Assigned Sections Breakdown</th>
            </tr>
          </thead>
          <tbody>
            {workloadStats.facultyList.map((fac: any, index: number) => (
              <tr key={fac.id || index} className={index % 2 === 1 ? 'bg-slate-100/70' : 'bg-white'}>
                <td className="border border-black p-2 text-center font-bold text-sm">{index + 1}</td>
                <td className="border border-black p-2 font-black text-sm text-slate-900">{fac.fullName}</td>
                <td className="border border-black p-2 text-center font-extrabold text-sm">{fac.shortName}</td>
                {selectedSection !== 'ALL' && (
                  <td className="border border-black p-2 text-center font-black text-sm bg-amber-100 text-black">
                    {fac.calculatedSectionTotal} hrs/wk
                  </td>
                )}
                <td className="border border-black p-2 text-center font-bold text-xs">{fac.overallTheoryHours} hrs</td>
                <td className="border border-black p-2 text-center font-bold text-xs">{includeTutorials ? fac.overallTutorialHours : 0} hrs</td>
                <td className="border border-black p-2 text-center font-bold text-xs">{fac.overallLabHours} hrs</td>
                <td className="border border-black p-2 text-center font-black text-sm text-black">
                  {fac.calculatedOverallTotal} hrs/wk
                </td>
                <td className="border border-black p-2 font-bold text-xs">
                  {fac.sectionBreakdownList && fac.sectionBreakdownList.length > 0 ? (
                    fac.sectionBreakdownList.map((sec: any) => `${sec.sectionName}: ${sec.totalHours}h`).join(' | ')
                  ) : (
                    fac.assignedSections.join(', ')
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Executive Summary Bar */}
        <div className="mt-4 p-3 border-2 border-black bg-slate-100 flex items-center justify-between text-xs font-black uppercase">
          <div>Total Campus Workload: {workloadStats.totalCampusWorkloadHours} Hours / Week</div>
          <div>Peak Workload: {workloadStats.highestWorkload} Hours / Week</div>
          <div>Average Load: ~{workloadStats.averageWorkload} Hours / Faculty</div>
        </div>

        {/* Official Signatures Block */}
        <div className="mt-12 pt-6 border-t-2 border-black grid grid-cols-3 gap-8 text-center text-xs font-black uppercase">
          <div>
            <div className="h-12"></div>
            <div className="border-t-2 border-black pt-1">Prepared By / Timetable Coordinator</div>
          </div>
          <div>
            <div className="h-12"></div>
            <div className="border-t-2 border-black pt-1">Dean Academics</div>
          </div>
          <div>
            <div className="h-12"></div>
            <div className="border-t-2 border-black pt-1">Principal / Vice-Chancellor</div>
          </div>
        </div>
      </div>
    </div>
  );
}
