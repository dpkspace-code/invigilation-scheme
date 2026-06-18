// Core schedule generation — ported from the browser app

function parseTimeToMinutes(str) {
  if (!str) return null;
  const m = String(str).match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

function computeDuration(ex) {
  const s = parseTimeToMinutes(ex.start_time);
  const e = parseTimeToMinutes(ex.end_time);
  if (s == null || e == null || e <= s) return null;
  return e - s;
}

function memberUnavailable(name, inst, peopleMap) {
  const person = peopleMap[name];
  if (!person || !person.unavail) return false;
  const tokens = String(person.unavail).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const date = String(inst.exam_date).toLowerCase();
  const slot = String(inst.slot || '').toLowerCase();
  return tokens.some(tok => {
    if (!tok.includes(date)) return false;
    if (/slot/.test(tok)) return tok.includes(slot);
    return true;
  });
}

function pairAvailable(p, inst, peopleMap) {
  return !p.members.some(name => memberUnavailable(name, inst, peopleMap));
}

function pairMatchesSubject(p, subject, peopleMap) {
  if (!subject) return false;
  return p.members.some(name => {
    const person = peopleMap[name];
    return person?.subject && subject.toLowerCase().includes(person.subject.toLowerCase());
  });
}

function generateSchedule({ teachers, attendants, pairs, venues, exams, ownSubjectRule = false }) {
  const peopleMap = {};
  teachers.forEach(t => { peopleMap[t.name] = { subject: t.subject || '', unavail: t.unavail || '', type: 'teacher' }; });
  attendants.forEach(a => { peopleMap[a.name] = { subject: '', unavail: a.unavail || '', type: 'attendant' }; });

  const venueMap = {};
  venues.forEach(v => { venueMap[v.name] = v; });

  const pairList = pairs
    .filter(p => p.member_a && p.member_b && p.member_a !== p.member_b)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(p => ({ id: p.id, members: [p.member_a, p.member_b], type: 'teacher', totalMinutes: 0, used: new Map() }));

  const attendantPairList = [];
  const sortedAttendants = [...attendants].sort((a, b) => a.sort_order - b.sort_order);
  for (let i = 0; i + 1 < sortedAttendants.length; i += 2) {
    attendantPairList.push({
      id: `attendant-pair-${i}`,
      members: [sortedAttendants[i].name, sortedAttendants[i + 1].name],
      type: 'attendant',
      totalMinutes: 0,
      used: new Map()
    });
  }

  const warnings = [];
  const unknownVenues = new Set();
  const noDurationRows = new Set();

  const sortedExams = [...exams].sort((a, b) => a.sort_order - b.sort_order);
  const instances = [];

  sortedExams.forEach((row, idx) => {
    const venue = venueMap[row.venue];
    let pairsNeeded = venue ? venue.pairs_needed : 1;
    if (!venue) unknownVenues.add(row.venue);
    let duration = computeDuration(row);
    if (!duration) { duration = 60; noDurationRows.add(idx + 1); }
    for (let k = 0; k < pairsNeeded; k++) {
      instances.push({ ...row, durationMin: duration, order: idx });
    }
  });

  if (unknownVenues.size) warnings.push(`Unknown venue(s): ${[...unknownVenues].join(', ')} — defaulted to 1 pair.`);
  if (noDurationRows.size) warnings.push(`Could not determine duration for exam row(s) ${[...noDurationRows].join(', ')} — defaulted to 60 min.`);

  // Group by date+slot for concurrency tracking
  const groups = {};
  instances.forEach(inst => {
    const key = inst.exam_date + '|' + inst.slot;
    if (!groups[key]) groups[key] = { order: inst.order, items: [] };
    groups[key].order = Math.min(groups[key].order, inst.order);
    groups[key].items.push(inst);
  });
  const groupKeys = Object.keys(groups).sort((a, b) => groups[a].order - groups[b].order);

  groupKeys.forEach(key => {
    const items = groups[key].items.slice().sort((a, b) => b.durationMin - a.durationMin);
    items.forEach(inst => {
      let candidates = pairList.filter(p => !p.used.has(key) && pairAvailable(p, inst, peopleMap));
      if (ownSubjectRule) {
        const filtered = candidates.filter(p => !pairMatchesSubject(p, inst.subject, peopleMap));
        if (filtered.length > 0) candidates = filtered;
      }
      candidates.sort((a, b) => a.totalMinutes - b.totalMinutes || String(a.id).localeCompare(String(b.id)));
      let chosen = candidates[0];
      let type = 'teacher';
      if (!chosen) {
        let aCandidates = attendantPairList.filter(p => !p.used.has(key) && pairAvailable(p, inst, peopleMap));
        aCandidates.sort((a, b) => a.totalMinutes - b.totalMinutes);
        chosen = aCandidates[0];
        type = 'attendant';
      }
      if (chosen) {
        chosen.used.set(key, true);
        chosen.totalMinutes += inst.durationMin;
        inst.assigned = { members: chosen.members, type, pairId: chosen.id };
      } else {
        inst.assigned = { members: [], type: 'unfilled', pairId: null };
        warnings.push(`No pair available for ${inst.subject} on ${inst.exam_date} ${inst.slot} (${inst.venue}).`);
      }
    });
  });

  // Aggregate results per exam row
  const rowResults = new Map();
  instances.forEach(inst => {
    if (!rowResults.has(inst.order)) rowResults.set(inst.order, { exam: inst, pairsList: [], durationMin: inst.durationMin });
    rowResults.get(inst.order).pairsList.push(inst.assigned);
  });

  // Individual timetables
  const individual = {};
  instances.forEach(inst => {
    inst.assigned.members.forEach(name => {
      if (!individual[name]) individual[name] = [];
      individual[name].push({
        exam_date: inst.exam_date, slot: inst.slot,
        start_time: inst.start_time, end_time: inst.end_time,
        durationMin: inst.durationMin, grade: inst.grade,
        subject: inst.subject, venue: inst.venue, candidates: inst.candidates
      });
    });
  });

  // Stats
  const totalTeacherMinutes = pairList.reduce((s, p) => s + p.totalMinutes, 0);
  const avgMinutes = pairList.length ? totalTeacherMinutes / pairList.length : 0;

  const pairSummary = [...pairList, ...attendantPairList].map(p => ({
    members: p.members,
    type: p.type,
    sessions: p.used.size,
    totalMinutes: p.totalMinutes,
    deviation: p.type === 'teacher' ? p.totalMinutes - avgMinutes : null
  }));

  return {
    rows: [...rowResults.values()].sort((a, b) => a.exam.order - b.exam.order),
    pairSummary,
    individual,
    warnings,
    stats: {
      totalExamRows: exams.length,
      totalPairSlots: instances.length,
      avgMinutes,
      unfilledSlots: instances.filter(i => i.assigned.type === 'unfilled').length
    }
  };
}

module.exports = { generateSchedule };
