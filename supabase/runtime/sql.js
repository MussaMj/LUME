// Translate only the SQL dialect used by the existing parameterised Express queries.
export function translate(query) {
  let result='',index=0,quoted=false;
  for(let i=0;i<query.length;i++) {
    const char=query[i];
    if(char==="'") {result+=char;if(quoted && query[i+1]==="'"){result+=query[++i];continue;}quoted=!quoted;continue;}
    result+=char==='?'&&!quoted?'$'+(++index):char;
  }
  if(/^\s*INSERT OR IGNORE\b/i.test(result))result=result.replace(/INSERT OR IGNORE/i,'INSERT')+' ON CONFLICT DO NOTHING';
  const tables='users|sessions|photos|inspired|collections|collection_items|featured|email_outbox|community_items|challenge_entries|event_rsvps|follows|follower_notifications|photo_views|weekly_featured|request_limits|account_tokens|account_mail|realtime_events';
  return (result.match(/'(?:''|[^'])*'|[^']+/g)||[]).map(part=>part.startsWith("'")?part:part
    .replace(new RegExp(`\\b(FROM|JOIN|UPDATE|INTO)\\s+(${tables})\\b`,'gi'),'$1 lume.$2')
    .replace(/(?<![.\w])(datetime|mix)\s*\(/g,'lume.$1(')
    .replace(/SET\s+hits\s*=\s*hits\s*\+\s*1/gi,'SET hits=request_limits.hits+1')).join('');
}
