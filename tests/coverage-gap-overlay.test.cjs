const fs=require("fs"),vm=require("vm"),assert=require("assert");
const context={window:{KoreDousuruCore:{loadMunicipality:async()=>({config:{},wasteItems:[],procedures:[],lifeEvents:[]}),searchProcedures:()=>[]}}};
vm.createContext(context);
vm.runInContext(fs.readFileSync("src/app/support-overlay.js","utf8"),context);
vm.runInContext(fs.readFileSync("src/app/coverage-gap-overlay.js","utf8"),context);
const o=context.window.__KORE_DOUSURU_COVERAGE_GAP_OVERLAY__;
assert(o,"coverage gap overlay missing");
assert.strictEqual(o.records.length,15);
const expected={"道路に穴":"ngy-gap-roads-damage","水漏れ":"ngy-gap-water-leak","断水":"ngy-gap-water-outage","年金払えない":"ngy-gap-pension-exemption","高額療養費":"ngy-gap-high-cost-medical","市営住宅":"ngy-gap-public-housing","騒音":"ngy-gap-noise-odor","給料未払い":"ngy-gap-labor","ひきこもり":"ngy-gap-hikikomori","不登校":"ngy-gap-youth-school-refusal","障害者相談":"ngy-gap-disability-support","発達障害":"ngy-gap-development-support","病児保育":"ngy-gap-childcare-sick","子どもが熱":"ngy-gap-pediatric-emergency","粗大ごみ収集":"ngy-gap-oversized-waste"};
for(const [q,id] of Object.entries(expected)){const r=o.search(q);assert(r.length,"no result: "+q);assert.strictEqual(r[0].id,id,q+" -> "+(r[0]&&r[0].id));}
const highCost=o.records.find(x=>x.procedure_id==="ngy-gap-high-cost-medical");assert(highCost.conclusion.includes("加入している健康保険"));assert(highCost.how_to.includes("国保以外"));
const noise=o.records.find(x=>x.procedure_id==="ngy-gap-noise-odor");assert(noise.conclusion.includes("工場・事業場"));assert(noise.conclusion.includes("管理組合・管理会社"));
const ids=o.records.map(x=>x.procedure_id);assert.strictEqual(new Set(ids).size,ids.length);
const supportIds=new Set(context.window.__KORE_DOUSURU_SUPPORT_OVERLAY__.records.map(x=>x.procedure_id));assert(o.records.every(x=>!supportIds.has(x.procedure_id)));
console.log("coverage gap overlay: "+Object.keys(expected).length+"/"+Object.keys(expected).length+" PASS");
