(function(root){
"use strict";
const VERSION="CAREER_UP_R8_20260408_V1_0_20260929";
const SOURCE={
  ministry:"https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/part_haken/jigyounushi/career.html",
  forms:"https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000118801_00022.html",
  checklist:"https://www.mhlw.go.jp/content/11910500/001688027.pdf",
  aichi:"https://jsite.mhlw.go.jp/aichi-roudoukyoku/hourei_seido_tetsuzuki/_121796/_120129/_120163/_120172.html"
};
function compact(s){return String(s||"").normalize("NFKC").replace(/[\s　]+/g,"");}
function corpus(text,names){return compact(String(text||"")+" "+(names||[]).join(" "));}
function hit(c,re){return re.test(c);}
function detect(text,names){
  const c=corpus(text,names);
  const strong=/キャリアアップ助成金|正社員化コース|キャリアアップ計画書|キャリアアップ計画/.test(c);
  const forms=/(別添様式1[-－ー]?1|別添様式１[-－ー]?１|別添様式1[-－ー]?2|別添様式１[-－ー]?２)/.test(c);
  return strong||forms;
}
function row(group,status,label,detail){return {group,status,label,detail};}
function check(text,names){
  const c=corpus(text,names);
  const rows=[];
  const req=[
    ["申請書類","支給申請書（様式第3号）",/キャリアアップ助成金支給申請書|支給申請書.*様式第?3号|様式第?3号.*支給申請書/],
    ["申請書類","正社員化コース内訳（別添様式1-1）",/正社員化コース内訳|別添様式[1１][-－ー]?[1１]/],
    ["申請書類","正社員化コース対象労働者詳細（別添様式1-2）",/正社員化コース対象労働者詳細|別添様式[1１][-－ー]?[2２]/],
    ["申請書類","支給要件確認申立書（共通要領様式第1号）",/支給要件確認申立書|共通要領様式第?[1１]号/],
    ["第1期の主な添付","受理済みキャリアアップ計画書",/キャリアアップ計画書|キャリアアップ計画/],
    ["第1期の主な添付","正社員転換前後の就業規則・労働協約等",/就業規則|労働協約/],
    ["第1期の主な添付","正社員転換前後の雇用契約書・労働条件通知書等",/雇用契約書|労働条件通知書/],
    ["第1期の主な添付","転換前後の賃金台帳等",/賃金台帳/],
    ["第1期の主な添付","3％以上増額の計算資料",/賃金上昇要件確認ツール|3[%％]以上増額|３[%％]以上増額|3[%％]|３[%％]/]
  ];
  req.forEach(function(r){
    const ok=hit(c,r[2]);
    rows.push(row(r[0],ok?"good":"warn",r[1],ok?"本文またはファイル名から手掛かりを検出しました。":"確認できません。未添付・別ファイル・OCR読み取り失敗の可能性があります。"));
  });
  const conditional=[
    ["条件付き書類","出勤簿・タイムカード等",/出勤簿|タイムカード/,"賃金台帳等だけで出勤日数・労働時間等を確認できない場合に必要です。"],
    ["条件付き書類","支払方法・受取人住所届",/支払方法|受取人住所届/,"未登録または振込口座変更の場合に必要です。"],
    ["条件付き書類","委任状",/委任状/,"代理人が申請する場合に必要です。"],
    ["条件付き書類","事業所確認票（様式第4号）",/事業所確認票|様式第?[4４]号/,"常時雇用する労働者数で中小企業事業主であることを証明する場合などに確認対象です。"]
  ];
  conditional.forEach(function(r){
    const ok=hit(c,r[2]);
    rows.push(row(r[0],ok?"good":"conditional",r[1],ok?"該当資料らしい手掛かりを検出しました。":r[3]));
  });

  const signals=[
    ["人間確認","適用する令和8年度様式",/(令和8|令和８|2026)/,"取組日で使用様式が分かれます。令和8年4月8日以降の取組は4月8日以降用様式かを公式ページで最終確認してください。"],
    ["人間確認","キャリアアップ計画の受理時期",/受理|受付/,"正社員転換の前日までに計画が受理されているかは、受理日と転換日を原本で照合してください。"],
    ["人間確認","正社員転換日と計画期間",/正社員転換|転換日/,"正社員転換日がキャリアアップ計画期間内かを原本の日付で照合してください。"],
    ["人間確認","転換前の雇用期間6か月以上",/6か月|６か月/,"対象労働者の転換前雇用期間が要件を満たすか、雇用契約書等の日付で確認してください。"],
    ["人間確認","転換前後6か月の賃金と3％以上増額",/賃金|給与|基本給/,"OCRで金額を読めても3％要件の成立は自動確定しません。公式の計算資料・賃金台帳で確認してください。"],
    ["人間確認","転換後の社会保険・雇用保険",/社会保険|健康保険|厚生年金|雇用保険/,"転換後の社会保険料・雇用保険料の控除等を賃金台帳で確認してください。"],
    ["人間確認","就業規則の転換制度・正社員待遇",/正社員|転換制度|賞与|退職金|昇給/,"転換制度の手続・要件・実施時期、正社員転換後の賞与または退職金制度と昇給等は規程原本で確認してください。"],
    ["人間確認","対象労働者の除外・定年要件",/親族|定年|取締役/,"正社員前提雇入れ、事業主・取締役の3親等以内親族、転換日から定年まで1年以上等の対象要件は個別確認が必要です。"]
  ];
  signals.forEach(function(r){
    const seen=hit(c,r[2]);
    rows.push(row(r[0],"manual",r[1],(seen?"関連語は読み取れました。":"関連情報を自動では十分に確認できません。")+" "+r[3]));
  });

  const phase2=hit(c,/第2期|第２期/);
  const periodHint=hit(c,/令和8年4月8日以降|令和８年４月８日以降/);
  return {
    version:VERSION,
    course:"正社員化コース",
    phase:phase2?"第2期の可能性":"第1期または期別不明",
    period:periodHint?"令和8年4月8日以降の取組用と読取":"取組日から適用様式を人間確認",
    rows:rows,
    sources:SOURCE,
    notice:"厚生労働省の令和8年4月8日以降用・正社員化コース支給申請チェックリストを基礎にした提出前セルフチェックです。受理・支給・採択を保証しません。"
  };
}
root.CareerUpR8Pack={VERSION,SOURCE,detect,check};
})(window);
