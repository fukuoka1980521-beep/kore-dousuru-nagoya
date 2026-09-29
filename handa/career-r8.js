(function(root){
"use strict";
const VERSION="CAREER_UP_R8_20260408_V1_5_20260929";
const SOURCE={
  ministry:"https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/part_haken/jigyounushi/career.html",
  forms:"https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000118801_00022.html",
  checklist:"https://www.mhlw.go.jp/content/11910500/001688027.pdf",
  aichi:"https://jsite.mhlw.go.jp/aichi-roudoukyoku/hourei_seido_tetsuzuki/_121796/_120129/_120163/_120172.html",
  qa:"https://www.mhlw.go.jp/content/11910500/001729696.pdf"
};
function compact(s){return String(s||"").normalize("NFKC").replace(/[\s　]+/g,"");}
function safeName(r){return String((r&&r.name)||"");}
function safeText(r){return String((r&&r.text)||"");}
function corpus(records){return compact((records||[]).map(r=>safeName(r)+" "+safeText(r)).join(" "));}
function readableRecords(records){return (records||[]).filter(r=>r&&r.readable!==false);}
function unreadableRecords(records){return (records||[]).filter(r=>r&&r.readable===false);}
function detect(text,names){return detectFiles([{name:(names||[]).join(" "),text:text||"",readable:true}]);}
function detectFiles(records){
  const c=corpus(records);
  return /キャリアアップ助成金|正社員化コース|キャリアアップ計画書|別添様式[1１][-－ー]?[1１]|別添様式[1１][-－ー]?[2２]/.test(c);
}
function looksDraft(r){
  const c=compact(safeName(r)+" "+safeText(r));
  return /草案|下書き|ひな形|雛形|テンプレート|要入力|要確定|提出用の公式様式そのものではありません|社内作業用|未作成・未提出/.test(c);
}
function looksRetrospective(r){
  const c=compact(safeText(r));
  return /過去の日付に遡って署名しない|現在日付で過去の実態を確認|雇用開始日以降の実際の労働条件を確認し.*明文化/.test(c);
}
function matchRecord(r, rule){
  const n=compact(safeName(r)), t=compact(safeText(r));
  return !!((rule.name&&rule.name.test(n))||(rule.text&&rule.text.test(t)));
}
function evidenceState(records,rule,opts){
  opts=opts||{};
  const readable=readableRecords(records);
  const hits=readable.filter(r=>matchRecord(r,rule));
  if(hits.length){
    const valid=hits.filter(r=>!looksDraft(r)&&!(opts.retrospectiveSensitive&&looksRetrospective(r)));
    if(valid.length) return {status:"good",detail:"本文またはファイル名から、草案・後日確認資料ではない該当書類の手掛かりを検出しました。"};
    if(opts.retrospectiveSensitive&&hits.some(looksRetrospective)) return {status:"manual",detail:"書類は確認できましたが、過去の労働条件を後日確認・明文化した資料の可能性があります。当時交付された雇用契約書等と同等に扱えるかは労働局確認が必要です。"};
    if(hits.some(looksDraft)) return {status:"draft",detail:"該当書類らしいものはありますが、下書き・草案・未確定資料の可能性があります。提出済み・受理済み・署名済みの正式資料としては自動確認しません。"};
    return {status:"manual",detail:"該当書類らしいものはありますが、正式資料としての状態を自動確定できません。原本を確認してください。"};
  }
  if(opts.future) return {status:"future",detail:"現在の書類セットは申請前準備段階の可能性があります。この書類は支給申請段階で必要になるため、今この時点で未作成でも直ちに不足とは扱いません。"};
  const unread=unreadableRecords(records);
  if(unread.length) return {status:"unknown",detail:"読取できなかったファイルがあるため、未添付なのか読取不能なのか判定できません。元PDFまたは鮮明な写真で再確認してください。"};
  return {status:"missing",detail:"アップロードされた読取可能な書類からは確認できませんでした。未添付・別ファイルの可能性を確認してください。"};
}
function row(group,status,label,detail){return {group,status,label,detail};}
function inferStage(records){
  const c=corpus(records);
  const hasApplication=/キャリアアップ助成金支給申請書|様式第?[3３]号.*支給申請|正社員化コース内訳|別添様式[1１][-－ー]?[1１]/.test(c);
  const prep=/転換予定|要確定|未作成・未提出|転記用下書き|正社員雇用契約書.*草案|事前確認/.test(c);
  if(hasApplication) return "APPLICATION";
  if(prep) return "PREPARATION";
  return "UNKNOWN";
}
function addDoc(rows,records,group,label,rule,opts){
  const s=evidenceState(records,rule,opts);
  rows.push(row(group,s.status,label,s.detail));
}

const DATE_TOKEN="(?:令和(?:元|[0-9]+)年[0-9]{1,2}月[0-9]{1,2}日|20[0-9]{2}年[0-9]{1,2}月[0-9]{1,2}日|20[0-9]{2}[-/.][0-9]{1,2}[-/.][0-9]{1,2})";
function parseDateToken(raw){
  const s=String(raw||"").normalize("NFKC").replace(/[\s　]+/g,"");
  let m=s.match(/^令和(元|[0-9]+)年([0-9]{1,2})月([0-9]{1,2})日$/);
  let y,mo,d;
  if(m){y=2018+(m[1]==="元"?1:Number(m[1]));mo=Number(m[2]);d=Number(m[3]);}
  else{
    m=s.match(/^(20[0-9]{2})年([0-9]{1,2})月([0-9]{1,2})日$/)||s.match(/^(20[0-9]{2})[-/.]([0-9]{1,2})[-/.]([0-9]{1,2})$/);
    if(!m)return null;
    y=Number(m[1]);mo=Number(m[2]);d=Number(m[3]);
  }
  const dt=new Date(Date.UTC(y,mo-1,d));
  if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==mo-1||dt.getUTCDate()!==d)return null;
  return String(y).padStart(4,"0")+"-"+String(mo).padStart(2,"0")+"-"+String(d).padStart(2,"0");
}
function dateToUtc(iso){if(!/^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(String(iso||"")))return null;const p=iso.split("-").map(Number);return new Date(Date.UTC(p[0],p[1]-1,p[2]));}
function addMonthsIso(iso,n){const d=dateToUtc(iso);if(!d)return null;const day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.toISOString().slice(0,10);}
function isBefore(a,b){const da=dateToUtc(a),db=dateToUtc(b);return !!(da&&db&&da.getTime()<db.getTime());}
function isOnOrBefore(a,b){const da=dateToUtc(a),db=dateToUtc(b);return !!(da&&db&&da.getTime()<=db.getTime());}
function qualityOf(r){if(!r||r.readable===false)return "unreadable";if(looksDraft(r))return "draft";if(looksRetrospective(r))return "retrospective";return "formal";}
function labeledDates(r,labelRe,maxGap){
  const t=compact(safeText(r)),gap=Number.isFinite(maxGap)?maxGap:36;
  const re=new RegExp("("+labelRe+")[:：]?[\\s\\S]{0,"+gap+"}?("+DATE_TOKEN+")","g");
  const out=[];let m;
  while((m=re.exec(t))!==null){const iso=parseDateToken(m[2]);if(iso)out.push({date:iso,label:m[1],record:safeName(r),quality:qualityOf(r)});}
  return out;
}
function planPeriods(records){
  const out=[];
  readableRecords(records).forEach(r=>{
    const t=compact(safeText(r));
    if(!/キャリアアップ計画/.test(compact(safeName(r)+" "+safeText(r))))return;
    const re=new RegExp("計画期間[:：]?[\\s\\S]{0,80}?("+DATE_TOKEN+")[\\s\\S]{0,30}?(?:から|～|〜|~|－|-|至)[\\s\\S]{0,30}?("+DATE_TOKEN+")","g");
    let m;while((m=re.exec(t))!==null){const a=parseDateToken(m[1]),b=parseDateToken(m[2]);if(a&&b)out.push({start:a,end:b,record:safeName(r),quality:qualityOf(r)});}
  });
  return out;
}
function actualTransferDates(records){
  const out=[];
  readableRecords(records).forEach(r=>{
    const c=compact(safeName(r)+" "+safeText(r));
    const application=/支給申請書|正社員化コース内訳|対象労働者詳細|別添様式[1１][-－ー]?[12１２]/.test(c);
    const postContract=/正社員雇用契約書|雇用区分[:：]?正社員|契約期間[:：]?期間の定めなし.*正社員/.test(c);
    if(application){
      out.push(...labeledDates(r,"正社員転換日|転換日|正社員化日",45));
    }
    if(postContract){
      const ds=labeledDates(r,"正社員転換日|転換日|正社員化日|雇用開始日",45);
      out.push(...ds);
    }
  });
  return out;
}
function plannedTransferDates(records){
  const out=[];
  readableRecords(records).forEach(r=>{
    const c=compact(safeName(r)+" "+safeText(r));
    if(/キャリアアップ計画|転換予定/.test(c))out.push(...labeledDates(r,"正社員転換予定日|転換予定日|転換予定|取組開始・転換予定",55));
  });
  return out;
}
function planAcceptedDates(records){
  const out=[];
  readableRecords(records).forEach(r=>{
    const c=compact(safeName(r)+" "+safeText(r));
    if(/キャリアアップ計画/.test(c))out.push(...labeledDates(r,"受理日|受付日|提出日",35));
  });
  return out;
}
function ruleEffectiveDates(records){
  const out=[];
  readableRecords(records).forEach(r=>{
    const c=compact(safeName(r)+" "+safeText(r));
    if(/就業規則|雇用区分規程|賃金規程|正社員転換規程/.test(c))out.push(...labeledDates(r,"施行日|適用開始日|施行",35));
  });
  return out;
}
function wageFacts(records){
  const facts=[];
  readableRecords(records).forEach(r=>{
    const c=compact(safeName(r)+" "+safeText(r)),q=qualityOf(r);
    let m;
    if(/時給制|時間給|時給/.test(c)){
      m=c.match(/(?:基本賃金|時間給|時給)[:：]?([0-9,]{3,})円/);
      if(m)facts.push({side:"pre",unit:"hour",amount:Number(m[1].replace(/,/g,"")),record:safeName(r),quality:q});
    }
    if(/正社員/.test(c)){
      m=c.match(/(?:基本月給|基本給|月給)[:：]?([0-9,]{4,})円/);
      if(m)facts.push({side:"post",unit:"month",amount:Number(m[1].replace(/,/g,"")),record:safeName(r),quality:q});
      m=c.match(/(?:時間給|時給)[:：]?([0-9,]{3,})円/);
      if(m)facts.push({side:"post",unit:"hour",amount:Number(m[1].replace(/,/g,"")),record:safeName(r),quality:q});
    }
  });
  return facts;
}
function uniqueFormalDates(entries){return [...new Set((entries||[]).filter(x=>x.quality==="formal").map(x=>x.date))];}
function consistencyRow(status,label,detail){return row("書類同士の整合",status,label,detail);}

function shortFile(name){const s=String(name||"");return s.length>42?s.slice(0,18)+"…"+s.slice(-20):s;}
function formalCoreRecords(records){
  return readableRecords(records).filter(r=>{
    const n=compact(safeName(r)),c=compact(safeName(r)+" "+safeText(r));
    if(qualityOf(r)!=="formal")return false;
    if(/重要判断メモ|事前確認事項メモ|社内作業|参考資料/.test(n))return false;
    return /支給申請書|正社員化コース内訳|対象労働者詳細|キャリアアップ計画|雇用契約書|労働条件通知書|就業規則|労働協約|賃金台帳|支給要件確認申立書/.test(c);
  });
}
function cleanPerson(v){
  return String(v||"").normalize("NFKC").replace(/[\s　]+/g,"").replace(/(様|殿)$/,"").replace(/[^一-龥々ぁ-んァ-ヶA-Za-z・ー]/g,"");
}
function personFacts(records){
  const out=[];
  formalCoreRecords(records).forEach(r=>{
    const raw=String(safeText(r)).normalize("NFKC");
    const patterns=[
      /(?:対象労働者氏名|対象労働者名|労働者氏名|従業員氏名)[\s　:：]*([一-龥々ぁ-んァ-ヶA-Za-z]{1,5}[\s　]?[一-龥々ぁ-んァ-ヶA-Za-z]{1,5})/,
      /(?:対象労働者|従業員)[\s　:：]+([一-龥々ぁ-んァ-ヶA-Za-z]{1,5}[\s　]+[一-龥々ぁ-んァ-ヶA-Za-z]{1,5})/
    ];
    for(const re of patterns){
      const m=raw.match(re);
      if(m){
        const v=cleanPerson(m[1]);
        if(v.length>=2&&v.length<=10&&!/正社員|対象労働|雇用契約|株式会社/.test(v)){
          out.push({value:v,record:safeName(r)});
          break;
        }
      }
    }
  });
  return out;
}
function cleanCompany(v){
  return String(v||"").normalize("NFKC").replace(/[\s　]+/g,"").replace(/[。,.，]/g,"");
}
function companyFacts(records){
  const out=[];
  formalCoreRecords(records).forEach(r=>{
    const c=compact(safeText(r));
    const patterns=[
      /(?:事業所名|会社名|事業主名|事業主|使用者)[:：]?((?:株式会社|有限会社|合同会社|一般社団法人|社会福祉法人|医療法人)[A-Za-z0-9一-龥々ぁ-んァ-ヶ・._ー]{1,32}?)(?=所在地|住所|代表者|雇用保険|労働者|従業員|$)/,
      /((?:株式会社|有限会社|合同会社|一般社団法人|社会福祉法人|医療法人)[A-Za-z0-9一-龥々ぁ-んァ-ヶ・._ー]{1,24})(?=雇用契約書|キャリアアップ|就業規則|$)/
    ];
    for(const re of patterns){
      const m=c.match(re);
      if(m){
        const v=cleanCompany(m[1]);
        if(v.length>=4&&v.length<=40){
          out.push({value:v,record:safeName(r)});
          break;
        }
      }
    }
  });
  return out;
}
function distinctValues(facts){return [...new Set((facts||[]).map(x=>x.value))];}
function formatFactLines(facts){
  return (facts||[]).map(x=>"「"+shortFile(x.record)+"」："+x.value).join(" ／ ");
}
function fieldConsistency(label,facts){
  const vals=distinctValues(facts);
  if(vals.length>1)return consistencyRow("conflict",label+"の一致","正式資料で値が一致しません。"+formatFactLines(facts)+"。OCR誤読の可能性もあるため原本を確認してください。");
  if(vals.length===1&&facts.length>=2)return consistencyRow("match",label+"の一致","2件以上の正式資料で「"+vals[0]+"」が一致しました。"+formatFactLines(facts)+"。");
  if(vals.length===1)return consistencyRow("manual",label+"の一致","正式資料1件から「"+vals[0]+"」を読み取りました。別の正式資料でも同じ値か確認してください。"+formatFactLines(facts)+"。");
  return consistencyRow("unknown",label+"の一致","安全に比較できる値を2件以上の正式資料から抽出できません。");
}
function formatDateEntries(entries){
  return (entries||[]).map(x=>"「"+shortFile(x.record)+"」："+x.date).join(" ／ ");
}


function parseMoneyToken(v,unit){
  const n=Number(String(v||"").replace(/,/g,""));
  if(!Number.isFinite(n))return null;
  return unit==="万円"?Math.round(n*10000):Math.round(n);
}
function findSideMoney(r,side){
  const t=compact(safeText(r));
  const label=side==="pre"?"(?:転換前|正社員転換前)":"(?:転換後|正社員転換後)";
  const patterns=[
    new RegExp(label+"(?:6か月|６か月)?(?:間)?(?:の)?(?:算定対象)?賃金(?:総額)?[:：]?([0-9,.]+)(万円|円)"),
    new RegExp(label+"[:：]?(?:6か月|６か月)間の賃金[:：]?([0-9,.]+)(万円|円)")
  ];
  for(const re of patterns){
    const m=t.match(re);
    if(m){const amount=parseMoneyToken(m[1],m[2]);if(amount!=null)return {side,amount,record:safeName(r),quality:qualityOf(r)};}
  }
  return null;
}
function findSideHours(r,side){
  const t=compact(safeText(r));
  const label=side==="pre"?"(?:転換前|正社員転換前)":"(?:転換後|正社員転換後)";
  const re=new RegExp(label+"(?:6か月|６か月)?(?:間)?(?:の)?(?:所定)?労働時間(?:総数)?[:：]?([0-9,.]+)(?:時間|h)");
  const m=t.match(re);
  if(!m)return null;
  const hours=Number(m[1].replace(/,/g,""));
  return Number.isFinite(hours)&&hours>0?{side,hours,record:safeName(r),quality:qualityOf(r)}:null;
}
function findPayForm(r,side){
  const t=compact(safeText(r));
  const label=side==="pre"?"(?:転換前|正社員転換前)":"(?:転換後|正社員転換後)";
  const m=t.match(new RegExp(label+"[\\s\\S]{0,60}?(月給|時給|時間給|日給)"));
  if(!m)return null;
  const form=m[1]==="時間給"?"時給":m[1];
  return {side,form,record:safeName(r),quality:qualityOf(r)};
}
function wageCalcFacts(records){
  const formal=readableRecords(records).filter(r=>qualityOf(r)==="formal");
  const preMoney=[],postMoney=[],preHours=[],postHours=[],preForms=[],postForms=[];
  formal.forEach(r=>{
    const a=findSideMoney(r,"pre"),b=findSideMoney(r,"post"),c=findSideHours(r,"pre"),d=findSideHours(r,"post"),e=findPayForm(r,"pre"),f=findPayForm(r,"post");
    if(a)preMoney.push(a);if(b)postMoney.push(b);if(c)preHours.push(c);if(d)postHours.push(d);if(e)preForms.push(e);if(f)postForms.push(f);
  });
  return {preMoney,postMoney,preHours,postHours,preForms,postForms};
}
function uniqueNumericFacts(facts,key){return [...new Set((facts||[]).map(x=>x[key]))];}
function uniqueStringFacts(facts,key){return [...new Set((facts||[]).map(x=>x[key]))];}
function moneyFmt(n){return Number(n).toLocaleString("ja-JP")+"円";}
function pctFmt(n){return Number(n).toFixed(2).replace(/\.00$/,"")+"％";}
function wageSourceLines(facts,key,fmt){
  return (facts||[]).map(x=>"「"+shortFile(x.record)+"」："+fmt(x[key])).join(" ／ ");
}
function excludedAllowanceWarnings(records){
  const defs=[
    ["通勤手当","実費補填の通勤手当"],
    ["住宅手当","家賃等を補填する住宅手当"],
    ["燃料手当","燃料手当"],
    ["工具手当","工具手当"],
    ["休日手当","休日手当"],
    ["時間外労働手当","時間外労働手当"],
    ["固定残業","固定残業代"],
    ["歩合給","歩合給"],
    ["精皆勤手当","精皆勤手当"],
    ["食事手当","食事手当"],
    ["賞与","賞与"]
  ];
  const hits=[];
  readableRecords(records).forEach(r=>{
    const t=compact(safeText(r));
    defs.forEach(d=>{if(t.includes(d[0]))hits.push({term:d[1],record:safeName(r)});});
  });
  const seen=new Set(),out=[];
  hits.forEach(x=>{const k=x.term+"|"+x.record;if(!seen.has(k)){seen.add(k);out.push(x);}});
  return out;
}
function wageIncreaseCandidate(records){
  const f=wageCalcFacts(records),rows=[];
  const preVals=uniqueNumericFacts(f.preMoney,"amount"),postVals=uniqueNumericFacts(f.postMoney,"amount");
  if(preVals.length>1)rows.push(consistencyRow("conflict","転換前6か月賃金総額","正式資料で転換前の算定対象賃金総額候補が一致しません。"+wageSourceLines(f.preMoney,"amount",moneyFmt)+"。"));
  if(postVals.length>1)rows.push(consistencyRow("conflict","転換後6か月賃金総額","正式資料で転換後の算定対象賃金総額候補が一致しません。"+wageSourceLines(f.postMoney,"amount",moneyFmt)+"。"));
  const excluded=excludedAllowanceWarnings(records);
  if(excluded.length){
    rows.push(consistencyRow("manual","3％計算に含めない手当の確認","算定除外候補の語を検出しました："+excluded.map(x=>"「"+shortFile(x.record)+"」の"+x.term).join(" ／ ")+"。これらが算定対象賃金総額に混入していないか原本で確認してください。"));
  }
  if(preVals.length!==1||postVals.length!==1){
    rows.push(consistencyRow("unknown","3％賃金増額の計算候補","転換前後それぞれの6か月算定対象賃金総額を一意に読み取れないため、計算候補を出しません。"));
    return rows;
  }
  const pre=preVals[0],post=postVals[0];
  if(pre<=0){rows.push(consistencyRow("unknown","3％賃金増額の計算候補","転換前賃金総額が0円以下のため計算できません。"));return rows;}
  const preForms=uniqueStringFacts(f.preForms,"form"),postForms=uniqueStringFacts(f.postForms,"form");
  const preH=uniqueNumericFacts(f.preHours,"hours"),postH=uniqueNumericFacts(f.postHours,"hours");
  const detailBase="転換前："+wageSourceLines(f.preMoney,"amount",moneyFmt)+" ／ 転換後："+wageSourceLines(f.postMoney,"amount",moneyFmt);
  if(preForms.length===1&&postForms.length===1&&preForms[0]!==postForms[0]){
    if(preH.length!==1||postH.length!==1){
      rows.push(consistencyRow("manual","3％賃金増額の計算候補",detailBase+"。支給形態が "+preForms[0]+" → "+postForms[0]+" と変わるため、転換前後それぞれの6か月所定労働時間が必要です。時間を一意に読み取れないので自動計算しません。"));
      return rows;
    }
    const preHourly=Math.ceil(pre/preH[0]),postHourly=Math.ceil(post/postH[0]);
    const pct=(postHourly-preHourly)/preHourly*100;
    const status=pct>=3?"candidate":"risk";
    rows.push(consistencyRow(status,"3％賃金増額の計算候補","厚労省Q&Aの支給形態変更時の考え方に沿う候補計算です。転換前："+moneyFmt(pre)+" ÷ "+preH[0].toLocaleString("ja-JP")+"時間 → "+moneyFmt(preHourly)+"/時、転換後："+moneyFmt(post)+" ÷ "+postH[0].toLocaleString("ja-JP")+"時間 → "+moneyFmt(postHourly)+"/時。候補増額率 "+pctFmt(pct)+(pct>=3?"（3％以上）":"（3％未満）")+"。円未満は切り上げています。最終要件充足は確定しません。"));
    return rows;
  }
  if(preForms.length===1&&postForms.length===1&&preForms[0]==="月給"&&postForms[0]==="月給"){
    if(preH.length===1&&postH.length===1&&preH[0]===postH[0]){
      const pct=(post-pre)/pre*100;
      rows.push(consistencyRow(pct>=3?"candidate":"risk","3％賃金増額の計算候補","転換前後とも月給で、読み取れた6か月所定労働時間も "+preH[0].toLocaleString("ja-JP")+"時間で一致しています。("+moneyFmt(post)+" - "+moneyFmt(pre)+") ÷ "+moneyFmt(pre)+" ×100 = "+pctFmt(pct)+(pct>=3?"（3％以上）":"（3％未満）")+"。最終要件充足は確定しません。"));
      return rows;
    }
    rows.push(consistencyRow("manual","3％賃金増額の計算候補",detailBase+"。転換前後とも月給ですが、所定労働時間が同じことを安全に確認できないため、6か月賃金総額だけでは自動計算しません。"));
    return rows;
  }
  rows.push(consistencyRow("manual","3％賃金増額の計算候補",detailBase+"。支給形態または所定労働時間の条件を安全に特定できないため、自動計算せず厚労省の賃金増額確認方法で確認してください。"));
  return rows;
}

function consistencyChecks(records){
  const rows=[];
  rows.push(fieldConsistency("対象労働者名",personFacts(records)));
  rows.push(fieldConsistency("事業所・会社名",companyFacts(records)));
  const actual=actualTransferDates(records),planned=plannedTransferDates(records);
  const actualFormalEntries=actual.filter(x=>x.quality==="formal");
  const actualFormal=uniqueFormalDates(actual),plannedFormal=uniqueFormalDates(planned);
  let transfer=null;
  if(actualFormal.length>1){
    rows.push(consistencyRow("conflict","正社員転換日の一致","正式資料で転換日が一致しません。"+formatDateEntries(actualFormalEntries)+"。OCR誤読を含め原本で確認してください。"));
  }else if(actualFormal.length===1){
    transfer=actualFormal[0];
    if(actualFormalEntries.length>=2){
      rows.push(consistencyRow("match","正社員転換日","2件以上の正式資料で転換日 "+transfer+" が一致しました。"+formatDateEntries(actualFormalEntries)+"。"));
    }else{
      rows.push(consistencyRow("manual","正社員転換日","正式資料1件から転換日候補 "+transfer+" を検出しました。別の正式資料でも同日か確認してください。"+formatDateEntries(actualFormalEntries)+"。"));
    }
  }else if(actual.some(x=>x.quality==="draft")||planned.some(x=>x.quality==="draft")){
    rows.push(consistencyRow("draft","正社員転換日","草案・予定資料から日付候補は読み取れますが、正式な転換日としては扱いません。"));
  }else if(plannedFormal.length){
    rows.push(consistencyRow("manual","正社員転換日","計画上の転換予定日は読み取れますが、実際の転換日を正式資料から確認できません。"));
  }else{
    rows.push(consistencyRow("unknown","正社員転換日","書類間照合に使える正式な転換日を確認できません。"));
  }

  if(transfer&&plannedFormal.length===1){
    rows.push(consistencyRow(plannedFormal[0]===transfer?"match":"conflict","計画上の転換予定日と実際の転換日",plannedFormal[0]===transfer?"計画上の予定日と正式資料の転換日が一致しています。予定："+formatDateEntries(planned.filter(x=>x.quality==="formal"))+" ／ 実際："+formatDateEntries(actualFormalEntries)+"。":"計画上の予定日 "+plannedFormal[0]+" と正式資料の転換日 "+transfer+" が一致しません。予定："+formatDateEntries(planned.filter(x=>x.quality==="formal"))+" ／ 実際："+formatDateEntries(actualFormalEntries)+"。計画変更届の有無も含め原本確認が必要です。"));
  }

  const periods=planPeriods(records).filter(x=>x.quality==="formal");
  if(transfer&&periods.length){
    const containing=periods.filter(p=>isOnOrBefore(p.start,transfer)&&isOnOrBefore(transfer,p.end));
    rows.push(consistencyRow(containing.length?"match":"conflict","転換日がキャリアアップ計画期間内か",containing.length?"転換日 "+transfer+" は「"+shortFile(containing[0].record)+"」の計画期間 "+containing[0].start+"〜"+containing[0].end+" 内です。":"転換日 "+transfer+" が読み取れた計画期間内に入りません。"+periods.map(p=>"「"+shortFile(p.record)+"」："+p.start+"〜"+p.end).join(" ／ ")+"。OCR誤読・変更届・別計画の有無を確認してください。"));
  }else{
    rows.push(consistencyRow("unknown","転換日がキャリアアップ計画期間内か","転換日または正式な計画期間を十分に読み取れないため自動照合できません。"));
  }

  const accepted=planAcceptedDates(records).filter(x=>x.quality==="formal");
  const acceptedDates=[...new Set(accepted.map(x=>x.date))];
  if(transfer&&acceptedDates.length===1){
    rows.push(consistencyRow(isBefore(acceptedDates[0],transfer)?"match":"conflict","計画の受理・提出日と転換日の前後関係",isBefore(acceptedDates[0],transfer)?"「"+shortFile(accepted[0].record)+"」の受理・提出日 "+acceptedDates[0]+" は転換日 "+transfer+" より前です。":"「"+shortFile(accepted[0].record)+"」の受理・提出日候補 "+acceptedDates[0]+" が転換日 "+transfer+" より前になっていません。原本の受理日を最優先で確認してください。"));
  }else{
    rows.push(consistencyRow("unknown","計画の受理・提出日と転換日の前後関係","受理日・提出日または正式な転換日を一意に読み取れないため自動照合しません。"));
  }

  const eff=ruleEffectiveDates(records).filter(x=>x.quality==="formal");
  const effDates=[...new Set(eff.map(x=>x.date))];
  if(transfer&&effDates.length===1){
    const six=addMonthsIso(effDates[0],6);
    if(six&&isOnOrBefore(six,transfer)){
      rows.push(consistencyRow("manual","賃金規定等の6か月適用期間","「"+shortFile(eff[0].record)+"」の施行日候補 "+effDates[0]+" から転換日 "+transfer+" までは日付上6か月以上あります。ただし、この規程が対象労働者に実際に6か月以上適用されたことは原本・運用記録で人間確認が必要です。"));
    }else{
      rows.push(consistencyRow("risk","賃金規定等の6か月適用期間","「"+shortFile(eff[0].record)+"」の施行日候補 "+effDates[0]+" から転換日 "+transfer+" までは日付上6か月未満です。より前から適用されていた別規程がないか確認してください。なければ要件に抵触する可能性があります。"));
    }
  }else{
    rows.push(consistencyRow("unknown","賃金規定等の6か月適用期間","正式な規程施行日と転換日を一意に読み取れないため自動判定しません。"));
  }

  const wf=wageFacts(records);
  const pre=wf.find(x=>x.side==="pre"&&x.quality==="formal"),post=wf.find(x=>x.side==="post"&&x.quality==="formal");
  if(pre&&post){
    const fmt=x=>x.amount.toLocaleString("ja-JP")+"円/"+(x.unit==="hour"?"時":"月");
    if(pre.unit!==post.unit){
      rows.push(consistencyRow("manual","転換前後の賃金比較","「"+shortFile(pre.record)+"」から転換前 "+fmt(pre)+"、「"+shortFile(post.record)+"」から転換後 "+fmt(post)+" の候補を抽出しました。支給形態が異なるため、3％要件は自動計算せず、所定労働時間・対象手当を含む公式計算方法で確認してください。"));
    }else{
      rows.push(consistencyRow("manual","転換前後の賃金比較","「"+shortFile(pre.record)+"」から転換前 "+fmt(pre)+"、「"+shortFile(post.record)+"」から転換後 "+fmt(post)+" の候補を抽出しました。同じ単位でも、3％要件に含める賃金・手当の範囲確認が必要なため自動確定しません。"));
    }
  }else{
    rows.push(consistencyRow("unknown","転換前後の賃金比較","転換前後の比較に必要な賃金値を正式資料から十分に抽出できません。"));
  }
  rows.push(...wageIncreaseCandidate(records));
  return rows;
}

function checkFiles(records){
  records=(records||[]).map(r=>({name:safeName(r),text:safeText(r),readable:r&&r.readable!==false,error:r&&r.error||""}));
  const rows=[],stage=inferStage(records),future=stage==="PREPARATION";
  rows.push(...consistencyChecks(records));
  const c=corpus(records),phase2=/第[2２]期/.test(c);

  addDoc(rows,records,"申請書類","支給申請書（様式第3号）",
    {name:/支給申請書|様式第?[3３]号/,text:/キャリアアップ助成金支給申請書|様式第?[3３]号.*支給申請書/},{future});
  addDoc(rows,records,"申請書類","正社員化コース内訳（別添様式1-1）",
    {name:/別添様式[1１][-－ー]?[1１]|正社員化コース内訳/,text:/正社員化コース内訳|別添様式[1１][-－ー]?[1１]/},{future});
  addDoc(rows,records,"申請書類","正社員化コース対象労働者詳細（別添様式1-2）",
    {name:/別添様式[1１][-－ー]?[2２]|対象労働者詳細/,text:/正社員化コース対象労働者詳細|別添様式[1１][-－ー]?[2２]/},{future});
  addDoc(rows,records,"申請書類","支給要件確認申立書（共通要領様式第1号）",
    {name:/支給要件確認申立書|共通要領様式第?[1１]号/,text:/支給要件確認申立書|共通要領様式第?[1１]号/},{future});

  if(!phase2){
    addDoc(rows,records,"第1期の主な添付","管轄労働局長に受理されたキャリアアップ計画書",
      {name:/キャリアアップ計画/,text:/キャリアアップ計画書/},{});
    addDoc(rows,records,"第1期の主な添付","正社員転換前後の就業規則・労働協約等",
      {name:/就業規則|労働協約/,text:/就業規則|労働協約/},{});
    addDoc(rows,records,"第1期の主な添付","正社員転換前後の雇用契約書・労働条件通知書等",
      {name:/雇用契約書|労働条件通知書/,text:/雇用契約書|労働条件通知書/},{retrospectiveSensitive:true});
    addDoc(rows,records,"第1期の主な添付","転換前後の賃金台帳等",
      {name:/賃金台帳/,text:/賃金台帳/},{future});
    addDoc(rows,records,"第1期の主な添付","3％以上増額の計算資料",
      {name:/賃金上昇要件確認|3[%％]|３[%％]/,text:/賃金上昇要件確認ツール|3[%％]以上増額|３[%％]以上増額/},{future});
  }else{
    addDoc(rows,records,"第2期の主な添付","第2期分の賃金台帳等",
      {name:/賃金台帳/,text:/賃金台帳/},{});
    addDoc(rows,records,"第2期の主な添付","第2期の出勤簿・タイムカード等（必要な場合）",
      {name:/出勤簿|タイムカード/,text:/出勤簿|タイムカード/},{});
    addDoc(rows,records,"第2期の主な添付","賃金改定がある場合の就業規則・労働協約等",
      {name:/就業規則|労働協約/,text:/就業規則|労働協約/},{});
  }

  [
    ["出勤簿・タイムカード等","賃金台帳等だけで出勤日数・労働時間等を確認できない場合に必要です。"],
    ["支払方法・受取人住所届","未登録または振込口座変更の場合に必要です。"],
    ["委任状","代理人が申請する場合に必要です。"],
    ["事業所確認票（様式第4号）","常時雇用する労働者数で中小企業事業主であることを証明する場合などに確認対象です。"],
    ["情報公表加算詳細（別添様式1-6）","情報公表加算を受ける場合に確認対象です。"]
  ].forEach(x=>rows.push(row("条件付き書類","conditional",x[0],x[1])));

  if(/未作成・未提出/.test(c)) rows.push(row("重要な検出","negative","キャリアアップ計画の未提出記録","アップロード資料に「未作成・未提出」とする記録を検出しました。過去時点の記録の可能性があるため、現在の受理済み計画書で更新確認してください。"));
  if(/過去の雇用契約書・労働条件通知書[:：]?取り交わしていない/.test(c)) rows.push(row("重要な検出","negative","過去契約書がない旨の記録","過去の雇用契約書・労働条件通知書を取り交わしていない旨の記録を検出しました。後日作成した確認書を当時の原契約書として扱わず、労働局へ取扱いを確認してください。"));
  if(/草案|下書き|要入力|要確定/.test(c)) rows.push(row("重要な検出","draft","草案・未確定資料","草案・下書き・要入力／要確定の記載を検出しました。完成済み提出書類として扱いません。"));

  [
    ["取組日に合う令和8年度様式か","正社員転換等の取組時点に合う様式を使用しているか、公式ページで最終確認してください。"],
    ["正社員転換日がキャリアアップ計画期間内か","転換日と計画期間を原本の日付で照合してください。"],
    ["キャリアアップ計画が転換前日までに受理されているか","受理印・受理日と正社員転換日を原本で照合してください。"],
    [phase2?"第2期の申請期間":"第1期の申請期間",phase2?"第1期の次の6か月分の賃金支払日翌日から2か月以内か確認してください。":"正社員転換後6か月分の賃金支払日翌日から2か月以内か確認してください。"],
    ["転換前に正社員と異なる賃金規定等の適用を6か月以上受けているか","就業規則等の施行日・適用実績を原本で確認してください。"],
    ["正社員転換前の雇用期間6か月以上か","雇用契約書等の日付から確認してください。"],
    ["転換前後6か月の賃金と3％以上増額","OCRで金額を読めても3％要件の成立は自動確定しません。公式の計算資料・賃金台帳で確認してください。"],
    ["転換後の社会保険・雇用保険","転換後の社会保険料・雇用保険料の控除等を賃金台帳で確認してください。"],
    ["就業規則の転換制度・正社員待遇","転換制度の手続・要件・実施時期、賞与または退職金制度、昇給等を規程原本で確認してください。"],
    ["対象労働者の除外・定年要件","正社員前提の雇入れ、親族、定年まで1年以上等の対象要件を個別確認してください。"]
  ].forEach(x=>rows.push(row("人間確認","manual",x[0],x[1])));

  const summary={
    good:rows.filter(r=>r.status==="good").length,
    missing:rows.filter(r=>r.status==="missing").length,
    unknown:rows.filter(r=>r.status==="unknown").length,
    draft:rows.filter(r=>r.status==="draft").length,
    negative:rows.filter(r=>r.status==="negative").length,
    future:rows.filter(r=>r.status==="future").length
  };
  return {
    version:VERSION,course:"正社員化コース",stage,phase:phase2?"第2期として確認":"第1期として確認（第2期表記を検出していないため）",
    rows,summary,sources:SOURCE,
    notice:"厚生労働省の令和8年4月8日以降用・正社員化コース支給申請チェックリストを基礎にした提出前セルフチェックです。受理・支給を保証しません。"
  };
}
function check(text,names){return checkFiles([{name:(names||[]).join(" "),text:text||"",readable:true}]);}
function selfTest(){
  const cases=[];
  function push(name,ok,detail){cases.push({name,ok:!!ok,detail:detail||""});}
  const prep=[
    {name:"キャリアアップ計画書_転記用下書き.pdf",text:"キャリアアップ計画書 転記用下書き 提出用の公式様式そのものではありません 要入力 要確定 正社員化コース",readable:true},
    {name:"転換前雇用契約書_確認版.pdf",text:"雇用契約書 労働条件通知書 過去の日付に遡って署名しない 実際の労働条件を確認し明文化する",readable:true},
    {name:"正社員雇用契約書_草案.pdf",text:"正社員雇用契約書 草案 要確定",readable:true}
  ];
  const a=checkFiles(prep);
  push("prep-stage",a.stage==="PREPARATION",a.stage);
  push("application-forms-future",a.rows.filter(r=>r.group==="申請書類").every(r=>r.status==="future"));
  push("plan-draft-not-good",a.rows.some(r=>r.label.indexOf("受理されたキャリアアップ計画書")>=0&&r.status==="draft"));
  push("retrospective-contract-manual",a.rows.some(r=>r.label.indexOf("雇用契約書")>=0&&r.status==="manual"));
  const unread=[{name:"キャリアアップ助成金_賃金台帳.pdf",text:"",readable:false,error:"OCR failed"}];
  const b=checkFiles(unread);
  push("unreadable-not-missing",b.rows.some(r=>r.label.indexOf("賃金台帳")>=0&&r.status==="unknown"));
  const app=[
    {name:"キャリアアップ助成金支給申請書_様式第3号.pdf",text:"キャリアアップ助成金支給申請書 様式第3号",readable:true},
    {name:"別添様式1-1.pdf",text:"正社員化コース内訳 別添様式1-1",readable:true},
    {name:"別添様式1-2.pdf",text:"正社員化コース対象労働者詳細 別添様式1-2",readable:true},
    {name:"支給要件確認申立書.pdf",text:"支給要件確認申立書 共通要領様式第1号",readable:true},
    {name:"キャリアアップ計画書_受理済.pdf",text:"キャリアアップ計画書 正社員化コース",readable:true},
    {name:"就業規則.pdf",text:"就業規則 正社員転換制度",readable:true},
    {name:"雇用契約書.pdf",text:"雇用契約書 労働条件通知書",readable:true},
    {name:"賃金台帳_3パーセント計算.pdf",text:"賃金台帳 賃金上昇要件確認ツール 3％以上増額",readable:true}
  ];
  const d=checkFiles(app);
  push("application-stage",d.stage==="APPLICATION",d.stage);
  push("four-application-docs-good",d.rows.filter(r=>r.group==="申請書類").every(r=>r.status==="good"));
  const consistent=[
    {name:"正式申請_内訳.pdf",text:"キャリアアップ助成金支給申請書 正社員化コース内訳 正社員転換日 2026年10月1日",readable:true},
    {name:"対象労働者詳細.pdf",text:"正社員化コース対象労働者詳細 転換日 2026年10月1日",readable:true},
    {name:"キャリアアップ計画書_受理済.pdf",text:"キャリアアップ計画書 計画期間 2026年4月1日から2030年3月31日 受理日 2026年9月1日",readable:true},
    {name:"就業規則.pdf",text:"就業規則 施行日 2026年3月1日 正社員転換制度",readable:true}
  ];
  const e=checkFiles(consistent);
  push("consistency-transfer-date",e.rows.some(r=>r.group==="書類同士の整合"&&r.label==="正社員転換日"&&r.status==="match"));
  push("consistency-plan-period",e.rows.some(r=>r.group==="書類同士の整合"&&r.label==="転換日がキャリアアップ計画期間内か"&&r.status==="match"));
  push("consistency-plan-before-transfer",e.rows.some(r=>r.group==="書類同士の整合"&&r.label==="計画の受理・提出日と転換日の前後関係"&&r.status==="match"));
  const conflict=[
    {name:"申請書.pdf",text:"キャリアアップ助成金支給申請書 正社員転換日 2026年10月1日",readable:true},
    {name:"対象労働者詳細.pdf",text:"正社員化コース対象労働者詳細 転換日 2026年10月2日",readable:true}
  ];
  const f2=checkFiles(conflict);
  push("consistency-conflict-detected",f2.rows.some(r=>r.group==="書類同士の整合"&&r.label==="正社員転換日の一致"&&r.status==="conflict"));
  const shortRule=[
    {name:"申請書.pdf",text:"キャリアアップ助成金支給申請書 正社員転換日 2026年10月1日",readable:true},
    {name:"就業規則.pdf",text:"就業規則 施行日 2026年9月1日 正社員転換制度",readable:true}
  ];
  const g=checkFiles(shortRule);
  push("six-month-risk",g.rows.some(r=>r.group==="書類同士の整合"&&r.label==="賃金規定等の6か月適用期間"&&r.status==="risk"));
  const realLike=[
    {name:"重要判断メモ.pdf",text:"キャリアアップ助成金 正社員化コース キャリアアップ計画 未作成・未提出 正社員転換希望日 2026年10月1日",readable:true},
    {name:"キャリアアップ計画書_転記用下書き.pdf",text:"キャリアアップ計画書 転記用下書き 提出用の公式様式そのものではありません 計画期間 要入力 取組開始・転換予定 要確定",readable:true},
    {name:"転換前雇用契約書_確認版.pdf",text:"雇用契約書兼労働条件通知書 時給制 基本賃金 時間給 1150円 過去の日付に遡って署名しない 実際の労働条件を確認し明文化する",readable:true},
    {name:"正社員雇用契約書_草案.pdf",text:"正社員雇用契約書 草案 雇用開始日 要確定 当初予定 2026年10月1日 基本月給 220000円",readable:true}
  ];
  const h=checkFiles(realLike);
  push("real-like-no-false-transfer-match",!h.rows.some(r=>r.group==="書類同士の整合"&&r.label==="正社員転換日"&&r.status==="match"));
  push("real-like-no-auto-3percent",h.rows.some(r=>r.group==="書類同士の整合"&&r.label==="転換前後の賃金比較"&&(r.status==="unknown"||r.status==="manual")));
  const oneTransfer=[{name:"支給申請書.pdf",text:"キャリアアップ助成金支給申請書 正社員転換日 2026年10月1日",readable:true}];
  const i=checkFiles(oneTransfer);
  push("single-transfer-source-not-match",!i.rows.some(r=>r.group==="書類同士の整合"&&r.label==="正社員転換日"&&r.status==="match"));
  const identityConflict=[
    {name:"対象労働者詳細A.pdf",text:"正社員化コース対象労働者詳細 対象労働者氏名 山田 太郎 正社員転換日 2026年10月1日 事業所名 株式会社テスト商事 所在地 愛知県",readable:true},
    {name:"雇用契約書B.pdf",text:"雇用契約書 従業員氏名 山田 次郎 雇用区分 正社員 雇用開始日 2026年10月1日 会社名 株式会社テスト商事 所在地 愛知県",readable:true}
  ];
  const j=checkFiles(identityConflict);
  push("person-field-conflict",j.rows.some(r=>r.group==="書類同士の整合"&&r.label==="対象労働者名の一致"&&r.status==="conflict"&&r.detail.indexOf("対象労働者詳細A.pdf")>=0&&r.detail.indexOf("雇用契約書B.pdf")>=0));
  const companyConflict=[
    {name:"支給申請書A.pdf",text:"キャリアアップ助成金支給申請書 事業所名 株式会社甲商事 所在地 愛知県 正社員転換日 2026年10月1日",readable:true},
    {name:"就業規則B.pdf",text:"就業規則 会社名 株式会社乙商事 所在地 愛知県 施行日 2026年3月1日",readable:true}
  ];
  const k=checkFiles(companyConflict);
  push("company-field-conflict",k.rows.some(r=>r.group==="書類同士の整合"&&r.label==="事業所・会社名の一致"&&r.status==="conflict"));
  const identityMatch=[
    {name:"対象労働者詳細1.pdf",text:"正社員化コース対象労働者詳細 対象労働者氏名 山田 太郎 正社員転換日 2026年10月1日 事業所名 株式会社テスト商事 所在地 愛知県",readable:true},
    {name:"雇用契約書2.pdf",text:"雇用契約書 従業員氏名 山田 太郎 雇用区分 正社員 雇用開始日 2026年10月1日 会社名 株式会社テスト商事 所在地 愛知県",readable:true}
  ];
  const l=checkFiles(identityMatch);
  push("identity-fields-match",l.rows.some(r=>r.label==="対象労働者名の一致"&&r.status==="match")&&l.rows.some(r=>r.label==="事業所・会社名の一致"&&r.status==="match"));
  const wageMonthly=[
    {name:"賃金増額確認資料.pdf",text:"転換前 支給形態 月給 転換前6か月賃金総額 1200000円 転換前6か月所定労働時間 960時間 転換後 支給形態 月給 転換後6か月賃金総額 1260000円 転換後6か月所定労働時間 960時間",readable:true}
  ];
  const m=checkFiles(wageMonthly);
  push("wage-monthly-candidate",m.rows.some(r=>r.label==="3％賃金増額の計算候補"&&r.status==="candidate"&&r.detail.indexOf("5％")>=0));
  const wageChanged=[
    {name:"賃金増額確認資料.pdf",text:"転換前 支給形態 時給 転換前6か月賃金総額 1000000円 転換前6か月所定労働時間 1000時間 転換後 支給形態 月給 転換後6か月賃金総額 1050000円 転換後6か月所定労働時間 1000時間",readable:true}
  ];
  const n=checkFiles(wageChanged);
  push("wage-form-change-hourly-candidate",n.rows.some(r=>r.label==="3％賃金増額の計算候補"&&r.status==="candidate"&&r.detail.indexOf("5％")>=0));
  const wageLow=[
    {name:"賃金増額確認資料.pdf",text:"転換前 支給形態 月給 転換前6か月賃金総額 1200000円 転換前6か月所定労働時間 960時間 転換後 支給形態 月給 転換後6か月賃金総額 1220000円 転換後6か月所定労働時間 960時間",readable:true}
  ];
  const o=checkFiles(wageLow);
  push("wage-below-3-risk",o.rows.some(r=>r.label==="3％賃金増額の計算候補"&&r.status==="risk"));
  const wageExcluded=[
    {name:"賃金台帳.pdf",text:"転換前6か月賃金総額 1200000円 通勤手当 30000円 賞与 50000円 転換後6か月賃金総額 1300000円",readable:true}
  ];
  const p=checkFiles(wageExcluded);
  push("wage-excluded-allowance-warning",p.rows.some(r=>r.label==="3％計算に含めない手当の確認"&&r.status==="manual"));
  return {version:VERSION,pass:cases.filter(x=>x.ok).length,total:cases.length,cases};
}
root.CareerUpR8Pack={VERSION,SOURCE,detect,detectFiles,check,checkFiles,inferStage,consistencyChecks,wageIncreaseCandidate,selfTest};
})(window);
