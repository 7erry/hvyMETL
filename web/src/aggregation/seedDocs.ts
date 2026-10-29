export const SAMPLE_COLLECTION = 'enrollments';

export const SAMPLE_DOCS: Record<string, unknown>[] = [
  {
    _id: 'enr_001',
    courseId: 'course_js_101',
    enrolledAt: '2026-01-12T10:00:00.000Z',
    status: 'active',
    score: 92,
  },
  {
    _id: 'enr_002',
    courseId: 'course_mongo_201',
    enrolledAt: '2026-02-03T14:30:00.000Z',
    status: 'active',
    score: 88,
  },
  {
    _id: 'enr_003',
    courseId: 'course_js_101',
    enrolledAt: '2025-11-20T09:15:00.000Z',
    status: 'completed',
    score: 95,
  },
  {
    _id: 'enr_004',
    courseId: 'course_data_301',
    enrolledAt: '2026-03-01T16:45:00.000Z',
    status: 'dropped',
    score: 40,
  },
  {
    _id: 'enr_005',
    courseId: 'course_mongo_201',
    enrolledAt: '2026-01-28T11:20:00.000Z',
    status: 'active',
    score: 76,
  },
  {
    _id: 'enr_006',
    courseId: 'course_data_301',
    enrolledAt: '2025-12-10T08:00:00.000Z',
    status: 'completed',
    score: 81,
  },
];
