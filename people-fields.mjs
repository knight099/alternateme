export const HABITS = {
  quiet: ['Quiet hours', 'Quiet evenings', 'Quiet mornings', 'Flexible hours'],
  sleep: ['Sleep schedule', 'Early riser', 'Night owl', 'Variable'],
  work: ['Work schedule', 'Day shift', 'Night shift', 'Variable'],
  cleaning: ['Cleaning', 'Daily', 'Weekly shared cleaning', 'As needed'],
  guests: ['Guests', 'Rarely', 'Sometimes', 'Frequently'],
  meals: ['Shared meals', 'Usually', 'Sometimes', 'Separate meals'],
  pets: ['Living with pets', 'Pet-friendly', 'Pet-free'],
  smoking: ['Indoor smoking', 'Smoke-free', 'Smoking allowed']
};
export const PROMPTS = ['Where did you grow up?', 'What brings you here?', 'What would a typical Tuesday at home look like?', 'What are you into lately?', 'What would you invite a flatmate to join?', 'How do you recharge after a long week?', 'What does a quiet evening at home look like for you?', 'Which hobby takes up the most space in your week?'];
export const INTERESTS = ['Hiking','Gaming','Cooking','Reading','Live music'];
export function fitDirection(preferences={}, habits={}) {
  const r={score:null,answered:0,applicable:0,agreements:[],differences:[],unknowns:[],conflicts:[],needsConfirmation:[],eligible:true};
  let weight=0,earned=0;
  for(const [key,[label]] of Object.entries(HABITS)){
    const p=preferences[key];
    if(!p || !['required','important','flexible'].includes(p.priority)) continue;
    const answer=habits[key], matches=p.choices?.includes(answer);
    const detail=label+' · '+(answer||'Unknown');
    r[!answer?'unknowns':matches?'agreements':'differences'].push(detail);
    if(p.priority==='required'){
      if(!answer || !matches){r.eligible=false;r[answer?'conflicts':'needsConfirmation'].push(label);}
      continue;
    }
    r.applicable++;
    if(!answer) continue;
    r.answered++;
    const w=p.priority==='important'?2:1;
    weight+=w;
    if(matches) earned+=w;
  }
  if(r.answered>=2) r.score=Math.round(100*earned/weight);
  return r;
}
