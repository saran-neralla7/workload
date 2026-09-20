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
  Layers
} from 'lucide-react';
import fullFacultyData from './full_faculty_data.json';
import * as xlsx from 'xlsx';

export default function App() {
  const [sections, setSections] = useState<string[]>([]);
  const [selectedSection, setSelectedSection] = useState<string>('ALL');
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

  const [activeTab, setActiveTab] = useState<'workload' | 'collaboration'>('workload');
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');

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

  // Extract unique sections
  useEffect(() => {
    const secSet = new Set<string>();
    allFacultyData.forEach(f => {
      f.assignedSections.forEach((s: string) => secSet.add(s));
    });
    const sortedSecs = Array.from(secSet).sort();
    setSections(['ALL', ...sortedSecs]);
  }, [allFacultyData]);

  // Recalculate workload stats whenever section filter, tutorial toggle, search, or dataset changes
  useEffect(() => {
    calculateAndFilterWorkload();
  }, [selectedSection, includeTutorials, searchQuery, allFacultyData]);

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

  const calculateAndFilterWorkload = () => {
    let list = allFacultyData.map(f => {
      let secLoad = 0;
      let secTheory = 0;
      let secTut = 0;
      let secLab = 0;

      let overallTheory = 0;
      let overallTut = 0;
      let overallLab = 0;

      // Group classes by section
      const sectionBreakdownMap: { [sec: string]: { sectionName: string; totalHours: number; classes: any[] } } = {};

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

      return {
        ...f,
        calculatedOverallTotal: effectiveOverallTotal,
        calculatedSectionTotal: secLoad,
        overallTheoryHours: overallTheory,
        overallTutorialHours: overallTut,
        overallLabHours: overallLab,
        sectionTheoryHours: secTheory,
        sectionTutorialHours: secTut,
        sectionLabHours: secLab,
        sectionBreakdownList,
      };
    });

    // Filter list by selected Section
    if (selectedSection && selectedSection !== 'ALL') {
      list = list.filter(f => f.assignedSections.includes(selectedSection));
    }

    // Filter by Search Query
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        f => f.shortName.toLowerCase().includes(q) || f.fullName.toLowerCase().includes(q)
      );
    }

    // Sort by calculated overall total workload descending
    list.sort((a, b) => b.calculatedOverallTotal - a.calculatedOverallTotal);

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

  const openScheduleModal = (fac: any) => {
    setSelectedFacultyDetails(fac);
    setIsScheduleModalOpen(true);
  };

  const openSectionsModal = (fac: any) => {
    setSectionsModalFaculty(fac);
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
          <div className="max-w-7xl mx-auto flex items-center gap-2">
            <button
              onClick={() => setActiveTab('workload')}
              className={`px-5 py-3 font-extrabold text-sm flex items-center gap-2 border-b-4 transition-all ${
                activeTab === 'workload'
                  ? 'border-[#DAA520] text-amber-300 bg-blue-950/80'
                  : 'border-transparent text-slate-300 hover:text-white hover:bg-blue-900/50'
              }`}
            >
              <Users className="w-4 h-4 text-[#DAA520]" />
              Faculty Workload Analytics
            </button>

            <button
              onClick={() => setActiveTab('collaboration')}
              className={`px-5 py-3 font-extrabold text-sm flex items-center gap-2 border-b-4 transition-all ${
                activeTab === 'collaboration'
                  ? 'border-[#DAA520] text-amber-300 bg-blue-950/80'
                  : 'border-transparent text-slate-300 hover:text-white hover:bg-blue-900/50'
              }`}
            >
              <Layers className="w-4 h-4 text-emerald-400" />
              Shared / Co-Faculty Collaboration Matrix
              <span className="ml-1 px-2.5 py-0.5 bg-emerald-500 text-slate-950 font-black text-[10px] rounded-full uppercase tracking-wider">NEW</span>
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

        {/* EXECUTIVE CONTROL BAR (Section Filter + Tutorial Checkbox + Search) */}
        <div className="bg-white p-6 rounded-2xl border-2 border-slate-200 shadow-md space-y-4">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-6">
            
            {/* 1. Section Filter Dropdown */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <label className="text-xs font-black uppercase tracking-wider text-[#0B2545] flex items-center gap-2">
                <Filter className="w-4 h-4 text-[#800000]" /> Program / Section Filter:
              </label>
              <select
                value={selectedSection}
                onChange={e => setSelectedSection(e.target.value)}
                className="bg-slate-50 border-2 border-slate-300 text-slate-900 font-extrabold text-base rounded-xl p-3 min-w-[240px] focus:ring-amber-500 focus:border-amber-500 shadow-sm cursor-pointer"
              >
                {sections.map(sec => (
                  <option key={sec} value={sec}>
                    {sec === 'ALL' ? '🌐 All Program Sections (95 Faculty)' : `📘 Section: ${sec}`}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Tutorial Hours Checkbox */}
            <div className="flex items-center">
              <label className="inline-flex items-center gap-3 cursor-pointer bg-amber-50 hover:bg-amber-100/80 p-3 rounded-xl border-2 border-amber-300 transition-colors shadow-sm">
                <input
                  type="checkbox"
                  checked={includeTutorials}
                  onChange={e => setIncludeTutorials(e.target.checked)}
                  className="w-5 h-5 text-[#800000] rounded focus:ring-amber-500 cursor-pointer accent-[#800000]"
                />
                <div>
                  <span className="text-sm font-extrabold text-[#0B2545] block leading-none">
                    Include Tutorial Hours (+1 hr/wk)
                  </span>
                  <span className="text-[11px] font-bold text-amber-800">
                    {includeTutorials ? '✓ Tutorials included in total workload' : '✕ Tutorials excluded from total workload'}
                  </span>
                </div>
              </label>
            </div>

            {/* 3. Search Bar */}
            <div className="relative w-full lg:w-80">
              <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                placeholder="Search faculty code or name..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3 text-sm bg-slate-50 border-2 border-slate-300 rounded-xl focus:ring-amber-500 focus:border-amber-500 font-bold text-slate-900 shadow-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 p-1"
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

        {/* FACULTY WORKLOAD TABLE */}
        {activeTab === 'workload' && (
          <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-md overflow-hidden">
            <div className="p-5 bg-slate-100 border-b-2 border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-[#800000] font-heading flex items-center gap-2">
                <Users className="w-6 h-6 text-[#800000]" />
                Official Faculty Workload Breakdown Table
              </h3>
              <span className="text-xs font-extrabold text-[#0B2545] bg-white px-3 py-1.5 rounded-lg border border-slate-300 shadow-sm">
                Showing {workloadStats.facultyList.length} Faculty Members
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#0B2545] text-white text-xs font-black uppercase tracking-wider">
                    <th className="p-4">Faculty Member</th>
                    <th className="p-4">Short Code</th>
                    {selectedSection !== 'ALL' && (
                      <th className="p-4 text-amber-300 bg-blue-950 border-x border-blue-900">
                        Section ({selectedSection}) Load
                      </th>
                    )}
                    <th className="p-4">Overall Total Workload</th>
                    <th className="p-4">Theory / Tut / Lab Breakdown</th>
                    <th className="p-4">Assigned Sections</th>
                    <th className="p-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-slate-100 text-base">
                  {workloadStats.facultyList.map(f => (
                    <tr key={f.id || f.shortName} className="hover:bg-slate-50/80 transition-colors">
                      
                      {/* Faculty Full Name */}
                      <td className="p-4 font-bold text-slate-900 text-base">
                        {f.fullName}
                      </td>

                      {/* Short Code Badge */}
                      <td className="p-4">
                        <span className="inline-block px-3 py-1 bg-red-100 text-[#800000] font-extrabold text-xs rounded-lg border border-red-300 shadow-sm">
                          {f.shortName}
                        </span>
                      </td>

                      {/* Section Workload (When Section Filter Active) */}
                      {selectedSection !== 'ALL' && (
                        <td className="p-4 bg-amber-50/60 font-bold text-[#800000] border-x border-amber-200">
                          <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-black bg-amber-200 text-amber-950 border border-amber-400 shadow-sm">
                            {f.calculatedSectionTotal} hrs / wk
                          </span>
                        </td>
                      )}

                      {/* Overall Total Workload */}
                      <td className="p-4 font-black text-[#0B2545] text-lg">
                        {f.calculatedOverallTotal} <span className="text-xs font-bold text-slate-500">hrs/wk</span>
                      </td>

                      {/* Breakdown */}
                      <td className="p-4 text-xs font-bold text-slate-700">
                        <span className="text-emerald-800 font-extrabold">{f.overallTheoryHours}h</span> Theory |{' '}
                        <span className={`font-extrabold ${includeTutorials ? 'text-blue-800' : 'text-slate-400 line-through'}`}>
                          {f.overallTutorialHours}h
                        </span> Tut |{' '}
                        <span className="text-amber-800 font-extrabold">{f.overallLabHours}h</span> Lab
                      </td>

                      {/* Assigned Sections Column with Click Here Modal Button */}
                      <td className="p-4">
                        <div className="flex flex-col gap-1.5 items-start">
                          {selectedSection !== 'ALL' ? (
                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-1 bg-[#800000] text-white font-extrabold text-xs rounded-md shadow-sm">
                                {selectedSection}: {f.calculatedSectionTotal} hrs
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs font-bold text-[#0B2545]">
                              {f.assignedSections.length} Sections Assigned
                            </span>
                          )}

                          {/* CLICK HERE BUTTON FOR ASSIGNED SECTIONS */}
                          <button
                            onClick={() => openSectionsModal(f)}
                            className="px-3 py-1 bg-amber-100 hover:bg-amber-200 text-amber-950 font-extrabold text-xs rounded-lg border border-amber-300 transition-colors flex items-center gap-1 shadow-sm mt-0.5"
                          >
                            <Layers className="w-3.5 h-3.5 text-[#800000]" />
                            Click Here for Sections Breakdown ({f.assignedSections.length})
                          </button>
                        </div>
                      </td>

                      {/* View Schedule Action Button */}
                      <td className="p-4 text-center">
                        <button
                          onClick={() => openScheduleModal(f)}
                          className="px-4 py-2 bg-[#0B2545] text-white text-xs font-extrabold rounded-xl hover:bg-[#800000] transition-colors flex items-center gap-1.5 mx-auto shadow-sm"
                        >
                          View Schedule
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

      {/* ================= MODAL 1: ASSIGNED SECTIONS WORKLOAD POPUP ================= */}
      {isSectionsModalOpen && sectionsModalFaculty && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-7 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto border-4 border-[#800000]">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b-2 pb-4 border-slate-200">
              <div>
                <div className="text-xs font-black text-[#800000] uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-[#800000]" /> Assigned Sections Workload Breakdown
                </div>
                <h3 className="text-2xl font-extrabold text-slate-900 font-heading">
                  {sectionsModalFaculty.fullName}
                </h3>
                <span className="text-sm font-extrabold text-[#0B2545]">
                  Short Code: {sectionsModalFaculty.shortName}
                </span>
              </div>
              <button
                onClick={() => setIsSectionsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Total Workload Header Summary */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-slate-100 rounded-2xl border border-slate-200 text-center">
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase">Overall Total Workload</div>
                <div className="text-2xl font-black text-[#0B2545] mt-0.5">
                  {sectionsModalFaculty.calculatedOverallTotal} hrs/wk
                </div>
              </div>
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase">Total Sections Assigned</div>
                <div className="text-2xl font-black text-[#800000] mt-0.5">
                  {sectionsModalFaculty.assignedSections.length} Sections
                </div>
              </div>
            </div>

            {/* Section Workload Breakdown List */}
            <div className="space-y-3">
              <h4 className="text-xs font-black text-[#0B2545] uppercase tracking-wider">
                Workload Per Assigned Section
              </h4>
              
              <div className="grid grid-cols-1 gap-3">
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
                      <div className="space-y-1">
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

                        {/* Subject Details */}
                        <div className="text-xs font-bold text-slate-700 pt-1">
                          {secItem.classes.map((cls: any, ci: number) => (
                            <div key={ci} className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-slate-900 font-bold">• {cls.subjectName} ({cls.subjectShort})</span>
                              <span className="text-slate-500">[{cls.sessionType}]</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Workload Pill */}
                      <div className="text-right">
                        <span className="text-xl font-black text-[#800000]">
                          {secItem.totalHours} hrs/wk
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 text-right">
              <button
                onClick={() => setIsSectionsModalOpen(false)}
                className="px-5 py-2.5 bg-[#0B2545] text-white font-bold text-sm rounded-xl hover:bg-[#800000] shadow-sm"
              >
                Close Sections Breakdown
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL 2: DETAILED SCHEDULE MODAL ================= */}
      {isScheduleModalOpen && selectedFacultyDetails && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-7 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto border-4 border-[#0B2545]">
            <div className="flex items-center justify-between border-b-2 pb-4 border-slate-200">
              <div>
                <div className="text-xs font-black text-[#800000] uppercase tracking-wider">Faculty Schedule Breakdown</div>
                <h3 className="text-2xl font-extrabold text-slate-900 font-heading">{selectedFacultyDetails.fullName}</h3>
                <span className="text-sm font-extrabold text-[#0B2545]">Short Code: {selectedFacultyDetails.shortName}</span>
              </div>
              <button
                onClick={() => setIsScheduleModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Total Summary */}
            <div className="grid grid-cols-3 gap-3 p-4 bg-slate-100 rounded-2xl text-center border border-slate-200">
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase">Total Workload</div>
                <div className="text-2xl font-black text-[#800000] mt-0.5">{selectedFacultyDetails.calculatedOverallTotal} hrs/wk</div>
              </div>
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase">Theory / Tut / Lab</div>
                <div className="text-sm font-extrabold text-slate-800 mt-1">
                  {selectedFacultyDetails.overallTheoryHours}h / {includeTutorials ? selectedFacultyDetails.overallTutorialHours : 0}h / {selectedFacultyDetails.overallLabHours}h
                </div>
              </div>
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase">Sections Taught</div>
                <div className="text-base font-extrabold text-[#0B2545] mt-1">{selectedFacultyDetails.assignedSections.length} Sections</div>
              </div>
            </div>

            {/* Detailed Class Schedule List */}
            <div className="space-y-3">
              <h4 className="text-xs font-black text-[#0B2545] uppercase tracking-wider">Assigned Classes & Subjects</h4>
              <div className="space-y-2.5">
                {selectedFacultyDetails.classes?.map((c: any, i: number) => {
                  const isTutExcluded = c.sessionType === 'Tutorial' && !includeTutorials;
                  return (
                    <div
                      key={i}
                      className={`p-4 rounded-2xl border-2 flex items-center justify-between ${
                        isTutExcluded
                          ? 'bg-slate-50 border-slate-200 opacity-60'
                          : c.branch === selectedSection
                          ? 'bg-amber-100/70 border-amber-400'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 bg-[#0B2545] text-white font-extrabold text-xs rounded-md">
                            {c.branch}
                          </span>
                          <span className={`text-xs font-extrabold px-2.5 py-0.5 rounded-md ${
                            c.sessionType === 'Lab' ? 'bg-amber-200 text-amber-950' : c.sessionType === 'Tutorial' ? 'bg-blue-200 text-blue-950' : 'bg-emerald-200 text-emerald-950'
                          }`}>
                            {c.sessionType}
                          </span>
                        </div>
                        <div className="text-base font-bold text-slate-900 mt-1">{c.subjectName}</div>
                        {c.coFacultyList && (
                          <div className="text-xs font-semibold text-slate-500 mt-0.5">Co-Teachers: {c.coFacultyList}</div>
                        )}
                      </div>
                      <div className="text-right">
                        <span className={`text-lg font-black ${isTutExcluded ? 'line-through text-slate-400' : 'text-[#800000]'}`}>
                          {c.hours} hrs/wk
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 text-right">
              <button
                onClick={() => setIsScheduleModalOpen(false)}
                className="px-5 py-2.5 bg-slate-800 text-white font-bold text-sm rounded-xl hover:bg-slate-900 shadow-sm"
              >
                Close Schedule
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
