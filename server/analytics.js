import { all, get, jsonParse } from './db.js';

const round = (n) => Math.round((Number(n) || 0) * 10) / 10;

/**
 * Builds the advanced teacher analytics payload. Everything is derived from
 * stored attempts/scores so it stays consistent with the reports and exports.
 */
export function analyticsOverview(teacherId, query = {}) {
  const filters = [];
  const args = [teacherId];
  if (query.class_id) { filters.push('a.class_id = ?'); args.push(query.class_id); }
  if (query.game_id) { filters.push('g.id = ?'); args.push(query.game_id); }
  const where = filters.length ? ' AND ' + filters.join(' AND ') : '';

  const scores = all(`
    SELECT sc.*, at.details, at.status attempt_status, at.started_at,
           u.full_name student_name, st.id student_id, st.grade_level, st.section,
           g.id game_id, g.title game_title, g.type game_type, g.competency_id,
           cc.title competency_title, cc.code competency_code,
           s.id subject_id, s.name subject_name, c.name class_name, sc.recorded_at
    FROM scores sc
    JOIN attempts at ON at.id = sc.attempt_id
    JOIN students st ON st.id = sc.student_id
    JOIN users u ON u.id = st.user_id
    JOIN games g ON g.id = sc.game_id
    LEFT JOIN assignments a ON a.id = at.assignment_id
    LEFT JOIN classes c ON c.id = a.class_id
    LEFT JOIN curriculum_competencies cc ON cc.id = g.competency_id
    LEFT JOIN subjects s ON s.id = g.subject_id
    WHERE g.teacher_id = ? ${where}
    ORDER BY sc.recorded_at DESC`, ...args);

  const questionMap = new Map();
  for (const q of all(`SELECT q.id, q.prompt, q.game_id, g.title game_title
                       FROM game_questions q JOIN games g ON g.id=q.game_id WHERE g.teacher_id=?`, teacherId)) {
    questionMap.set(String(q.id), q);
  }

  const misses = new Map();
  for (const row of scores) {
    const details = jsonParse(row.details, []);
    for (const item of Array.isArray(details) ? details : []) {
      if (item?.correct !== false) continue;
      const key = String(item.questionId ?? '');
      const entry = misses.get(key) || {
        questionId: key,
        prompt: questionMap.get(key)?.prompt || 'Question no longer available',
        game: questionMap.get(key)?.game_title || row.game_title,
        wrong: 0,
        attempts: 0
      };
      entry.wrong += 1;
      entry.attempts += 1;
      misses.set(key, entry);
    }
  }

  const grouped = (keyFn, valueFn) => {
    const map = new Map();
    for (const row of scores) {
      const key = keyFn(row) || 'Unassigned';
      if (!map.has(key)) map.set(key, { key, count: 0, values: [] });
      const entry = map.get(key);
      entry.count += 1;
      entry.values.push(valueFn(row));
    }
    return [...map.values()].map((e) => ({
      key: e.key,
      count: e.count,
      avg: round(e.values.reduce((a, b) => a + b, 0) / e.values.length),
      mastered: e.values.filter((v) => v >= 75).length
    }));
  };

  const competencyMastery = grouped((r) => r.competency_title, (r) => r.percentage)
    .map((c) => ({ ...c, mastery: round((c.mastered / c.count) * 100) }))
    .sort((a, b) => a.mastery - b.mastery);

  const subjectPerformance = grouped((r) => r.subject_name, (r) => r.percentage)
    .sort((a, b) => b.avg - a.avg);

  // Students with weak or no results, including enrolled students who have
  // never played an assigned game.
  const studentStats = new Map();
  for (const row of scores) {
    const s = studentStats.get(row.student_id) || {
      student_id: row.student_id,
      student_name: row.student_name,
      grade_level: row.grade_level,
      section: row.section,
      attempts: 0,
      total: 0,
      last: row.recorded_at
    };
    s.attempts += 1;
    s.total += row.percentage;
    studentStats.set(row.student_id, s);
  }
  const enrolled = all(`SELECT st.id student_id, u.full_name student_name, st.grade_level, st.section
                        FROM class_students cs JOIN students st ON st.id=cs.student_id
                        JOIN users u ON u.id=st.user_id JOIN classes c ON c.id=cs.class_id
                        WHERE c.teacher_id=?`, teacherId);
  for (const s of enrolled) {
    if (!studentStats.has(s.student_id)) studentStats.set(s.student_id, { ...s, attempts: 0, total: 0, last: null });
  }
  const atRisk = [...studentStats.values()]
    .map((s) => ({ ...s, avg: s.attempts ? round(s.total / s.attempts) : 0 }))
    .filter((s) => s.avg < 60 || s.attempts === 0)
    .sort((a, b) => a.avg - b.avg || b.attempts - a.attempts)
    .slice(0, 25);

  const trendMap = new Map();
  for (const row of scores) {
    const day = String(row.recorded_at).slice(0, 10);
    const t = trendMap.get(day) || { day, plays: 0, total: 0 };
    t.plays += 1;
    t.total += row.percentage;
    trendMap.set(day, t);
  }
  const scoreTrend = [...trendMap.values()]
    .map((t) => ({ ...t, avg: round(t.total / t.plays) }))
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-14);

  const gameCompletion = all(`
    SELECT g.id game_id, g.title game_title, g.type game_type,
           COUNT(at.id) attempts,
           SUM(CASE WHEN at.status='completed' THEN 1 ELSE 0 END) completed,
           ROUND(AVG(sc.percentage),1) avg_score
    FROM games g LEFT JOIN attempts at ON at.game_id=g.id
    LEFT JOIN scores sc ON sc.attempt_id=at.id
    WHERE g.teacher_id=? GROUP BY g.id ORDER BY attempts DESC LIMIT 20`, teacherId);

  const readingProgress = all(`
    SELECT l.id lesson_id, l.title lesson_title, COUNT(rs.id) sessions,
           COALESCE(SUM(rs.time_spent),0) seconds,
           ROUND(AVG(rs.time_spent),0) avg_seconds
    FROM lessons l LEFT JOIN reading_sessions rs ON rs.lesson_id=l.id
    WHERE l.teacher_id=? GROUP BY l.id ORDER BY sessions DESC LIMIT 10`, teacherId);

  const passed = scores.filter((r) => r.passed).length;
  const kpis = {
    scores: scores.length,
    average: scores.length ? round(scores.reduce((a, r) => a + r.percentage, 0) / scores.length) : 0,
    pass_rate: scores.length ? round((passed / scores.length) * 100) : 0,
    points: scores.reduce((a, r) => a + r.points, 0),
    students: studentStats.size,
    games: get('SELECT COUNT(*) c FROM games WHERE teacher_id=?', teacherId).c,
    at_risk: atRisk.length,
    reading_sessions: get(`SELECT COUNT(*) c FROM reading_sessions rs JOIN lessons l ON l.id=rs.lesson_id WHERE l.teacher_id=?`, teacherId).c
  };

  return {
    kpis,
    competencyMastery,
    frequentMisses: [...misses.values()].sort((a, b) => b.wrong - a.wrong).slice(0, 20),
    atRisk,
    scoreTrend,
    subjectPerformance,
    gameCompletion,
    readingProgress,
    classes: all('SELECT id,name FROM classes WHERE teacher_id=? ORDER BY name', teacherId),
    games: all('SELECT id,title FROM games WHERE teacher_id=? ORDER BY title', teacherId)
  };
}

export function analyticsPdfBlocks(data, teacherName) {
  return [
    { type: 'heading', text: 'Key indicators' },
    { type: 'table', columns: ['Indicator', 'Value'], rows: [
      ['Recorded scores', data.kpis.scores],
      ['Average score', `${data.kpis.average}%`],
      ['Pass rate (>=75%)', `${data.kpis.pass_rate}%`],
      ['Points earned', data.kpis.points],
      ['Students observed', data.kpis.students],
      ['Students needing practice', data.kpis.at_risk],
      ['Reading sessions', data.kpis.reading_sessions]
    ] },
    { type: 'heading', text: 'Competency mastery' },
    data.competencyMastery.length
      ? { type: 'table', columns: ['Competency', 'Attempts', 'Avg %', 'Mastery %'], rows: data.competencyMastery.map((c) => [c.key, c.count, c.avg, c.mastery]) }
      : { type: 'text', text: 'No competency-aligned attempts recorded yet.' },
    { type: 'heading', text: 'Frequently missed questions' },
    data.frequentMisses.length
      ? { type: 'table', columns: ['Game', 'Question', 'Misses'], rows: data.frequentMisses.map((m) => [m.game, m.prompt, m.wrong]) }
      : { type: 'text', text: 'No incorrect answers recorded yet.' },
    { type: 'heading', text: 'Students needing additional practice' },
    data.atRisk.length
      ? { type: 'table', columns: ['Student', 'Grade', 'Attempts', 'Avg %'], rows: data.atRisk.map((s) => [s.student_name, s.grade_level || '-', s.attempts, s.avg]) }
      : { type: 'text', text: 'All observed students are meeting the passing threshold.' },
    { type: 'heading', text: 'Subject performance' },
    { type: 'bars', items: data.subjectPerformance.map((s) => ({ label: s.key, value: s.avg, max: 100, suffix: '%' })) },
    { type: 'text', text: `Prepared for ${teacherName}. Competency codes are only shown when a teacher has entered and verified them from official DepEd documents.` }
  ];
}
