/** Reproducible, source-hash-bound derivation. Generates new artifacts, never edits the source. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseDiagramJSON } from "../src/export";
import { runValidationCases, runValidationCase } from "../src/validation";
import { buildDiagnosisReport } from "../src/report";
import { collectAdvice } from "../src/advice";
import { applyStates, snapshotStates, type PresetStateMap } from "../src/presets";
import { pipePolyline, pathD, portWorldPos, nodeBBox } from "../src/geometry";
import { NodeSymbol } from "../src/symbols";
import type { Diagram, ValidationCase } from "../src/types";

const sourcePath = "/Users/leo/Desktop/Fluidpath studio/Smart Y BCTMS.json";
const expectedHash = "8906697b6b23bfa7c60ce1ad771498930203515b4e51cce6be241e43e04688ee";
const outputDir = process.argv[2] || "outputs/smart-y-bct";
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const sourceText = readFileSync(sourcePath, "utf8");
assert.equal(sha(sourceText), expectedHash, "Source changed; inspect topology before regenerating");
const source = JSON.parse(sourceText) as Diagram;
const diagram = structuredClone(source);
diagram.id = "diagram_smart_y_bct_8906697b6b23_r1";
diagram.name = "Smart Y BCT";
const ni = (i: number) => source.nodes[i].id;
const pi = (i: number) => source.pipes[i].id;
const node = (i: number) => diagram.nodes.find(n => n.id === ni(i))!;
const pipe = (i: number) => diagram.pipes.find(p => p.id === pi(i))!;

// Keep coffee, hot-water, cold/americano-water, water supply and their common waste path.
const keep = new Set([0,1,2,3,4,5,6,7,8,9,10,11,15,16,18,19,20,25,26,31,32,42,44,48,49,50,51,62,63].map(ni));
const edits: object[] = [];
// Explicit bypasses, keeping the upstream pipe ID and downstream endpoint identity.
for (const [upstream, downstream, via] of [[51,3,[29]], [8,12,[23]], [6,57,[52]], [34,36,[34]], [50,25,[33]]] as const) {
  const before = { fromPortId: pipe(upstream).fromPortId, toPortId: pipe(upstream).toPortId };
  pipe(upstream).toPortId = pipe(downstream).toPortId;
  edits.push({ op: "reconnectPipe", pipeId: pi(upstream), before, after: { fromPortId: pipe(upstream).fromPortId, toPortId: pipe(upstream).toPortId }, bypassedNodes: via.map(ni), replacedPipeId: pi(downstream) });
}
diagram.nodes = diagram.nodes.filter(n => keep.has(n.id));
const ports = new Set(diagram.nodes.flatMap(n => n.ports.map(p => p.id)));
diagram.pipes = diagram.pipes.filter(p => ports.has(p.fromPortId!) && ports.has(p.toPortId!));
node(18).label = "公共排废两通电磁阀";
node(1).label = "进水两通电磁阀";
// IDs and allowed directions are unchanged. Display placement is explicitly separate.
const layout: Record<number, [number, number, number?]> = {
  19:[80,1182],2:[250,1176],42:[420,1172,180],1:[600,1149.84],0:[780,1155],3:[980,1162],50:[1160,1176],
  26:[1360,1168],4:[1357,1000],11:[1540,1168],10:[1540,1320],44:[1740,1150],5:[1666,600],
  6:[2000,275],49:[2150,220],63:[2410,80],15:[2570,300],9:[2000,550],16:[2566,650],7:[2000,800],
  25:[2000,1019.84],8:[2000,1131.84],51:[2270,1050],20:[2460,860],62:[2410,460],48:[2600,1468],
  18:[1200,1484.16],31:[830,1455],32:[500,1568],
};
for (const [i, [x,y,rotation]] of Object.entries(layout)) { const n=node(Number(i)); n.x=x; n.y=y; if(rotation!==undefined)n.rotation=rotation; }
const points: Record<number, number[][]> = {
  0:[[1772,320.88]], 1:[[1572,1270],[1490,1270],[1490,1362]], 2:[[1772,1100],[1774.12,1100]],
  4:[],5:[],6:[[2039,700],[1940,700],[1940,845.88]],7:[[2110,320.88],[2110,440],[2208,440]],
  8:[[1825,520],[1920,520],[1920,595.88]],9:[[2589,595.88]],11:[],13:[[1700,1192.32],[1700,1270],[1772,1270]],
  14:[],15:[[2039,990],[1940,990],[1940,1070]],16:[[2200,1182],[2200,1110]],17:[[2612,125.88]],
  18:[[2302,820],[2502,820]],19:[[1450,1200]],26:[[536,1500]],27:[],34:[[2700,505.88],[2700,1500]],
  44:[],47:[],49:[[2039,390],[1880,390],[1880,1430],[2632,1430]],50:[],51:[],52:[],53:[[2208,125.88]],
  54:[],55:[],56:[[2350,845.88],[2350,505.88]],66:[],
};
const pipeLabels: Record<number,string>={0:"锅炉—冲泡阀",1:"安全阀取压",2:"锅炉补水",4:"止回阀—取压三通",5:"进水止回—滤网",6:"热水选择—旁通阀",7:"冲泡供水",8:"锅炉—热水选择阀",9:"热水杆供水",11:"水源进水",13:"供水—分配三通",14:"供水压力",15:"美式热水支路",16:"美式冷水支路",17:"咖啡出液",18:"美式水出液",19:"主供水",26:"总排废出口",27:"排废阀—接口",34:"冲洗排废",44:"进水阀—水泵",47:"冷水分支",49:"冲泡阀排废",50:"公共排废汇流",51:"水泵—流量计",52:"流量计—止回阀",53:"冲泡腔出液",54:"咖啡阀排废",55:"美式热水合流",56:"旁通冲洗供水",66:"滤网—进水阀"};
for(const [index,label] of Object.entries(pipeLabels)) {const p=pipe(Number(index));p.label=label;p.routing="orthogonal";p.points=(points[Number(index)]||[]).map(([x,y])=>({x,y}));}
const removedPresentationOverrides=diagram.pipes.filter(p=>p.teachingOverride||p.forceFlow||p.forceStop).map(p=>({pipeId:p.id,teachingOverride:p.teachingOverride,forceFlow:p.forceFlow,forceStop:p.forceStop}));
for(const p of diagram.pipes){delete p.teachingOverride;delete p.forceFlow;delete p.forceStop;}

// Full actuator baseline: none of the acceptance cases depends on the current canvas switches.
const idle: PresetStateMap={};
for(const n of diagram.nodes) {
  if(n.type==="pump")idle[n.id]={pumpOn:false};
  if(n.type==="solenoid2")idle[n.id]={valveState:"closed"};
  if(n.type==="solenoid3")idle[n.id]={valvePath:"off"};
}
const state=(overrides: Record<number,object>):PresetStateMap=>Object.assign(structuredClone(idle),Object.fromEntries(Object.entries(overrides).map(([i,v])=>[ni(Number(i)),v])));
const supply={0:{pumpOn:true},1:{valveState:"open"}};
const brew=state({...supply,6:{valvePath:"A"},63:{valvePath:"A"}});
const hot=state({...supply,9:{valvePath:"A"}});
const hotAmericano=state({...supply,9:{valvePath:"B"},7:{valvePath:"B"},25:{valveState:"open"}});
const coldAmericano=state({...supply,8:{valveState:"open"}});
const drain=state({...supply,6:{valvePath:"B"},18:{valveState:"open"}});
const feed=[44,51,52,4,19,13,2], brewPath=[0,7,53,17], mainWaste=[49,50,27,26];
const cases:ValidationCase[]=[];
function acceptance(id:string,name:string,st:PresetStateMap,flow:number[],stop:number[]) { cases.push({id,name,state:st,mustFlowPipeIds:flow.map(pi),mustStopPipeIds:stop.map(pi)}); }
acceptance("bct_A01","断水停泵：实际补水链与出口停流",structuredClone(idle),[],[...feed,...brewPath,8,9,6,15,55,47,16,18,34,...mainWaste]);
acceptance("bct_A02","仅停主泵：冲泡通路打开仍停流",{...brew,[ni(0)]:{pumpOn:false}},[],[...feed,...brewPath]);
acceptance("bct_A03","冲泡咖啡：供水与咖啡链有效",brew,[...feed,...brewPath],[9,18,49,27,26]);
acceptance("bct_A04","进水阀关闭：泵开启也不能凭空供水",{...brew,[ni(1)]:{valveState:"closed"}},[],[...feed,...brewPath]);
acceptance("bct_A05","冲泡阀关闭：咖啡出口停流",{...brew,[ni(6)]:{valvePath:"off"}},[],brewPath);
acceptance("bct_A06","热水杆：热水有效且咖啡支路关闭",hot,[...feed,8,9],[7,17,6,18,27,26]);
acceptance("bct_A07","美式热水：旁通热水到美式出口",hotAmericano,[...feed,8,6,15,55,18],[7,17,9,16,27,26]);
acceptance("bct_A08","美式冷水：冷水支路独立供给",coldAmericano,[44,51,52,4,19,13,47,16,18],[0,7,17,9,55,27,26]);
acceptance("bct_A09","冲泡阀排废：公共排废通路有效",drain,[...feed,0,...mainWaste],[7,17,9,18]);
acceptance("bct_A10","排废阀关闭：下游排废停止",{...drain,[ni(18)]:{valveState:"closed"}},[],[27,26]);
diagram.settings.validationCases=cases;
diagram.settings.workConditions=[{name:"00 待机／各阀关闭",state:structuredClone(idle)},{name:"01 冲泡咖啡",state:brew},{name:"02 热水杆",state:hot},{name:"03 美式热水",state:hotAmericano},{name:"04 美式冷水",state:coldAmericano},{name:"05 冲泡阀排废",state:drain}];
// Original overrides contain missing IDs and removed milk parts; retain their source in the manifest only.
delete diagram.settings.scenarioOverrides;
delete diagram.settings.customScenarios;
diagram.settings.workingCopyOf=sourcePath;
diagram.settings.workingCopyStartedAt=new Date().toISOString();
Object.assign(diagram.settings,{appVersion:"1.27.0",background:"#f3f7fb",backgroundType:"dot",showNodeLabels:true,showPipeLabels:false,showFluidLabels:false,nodeLabelFontSize:18,pressureShading:false});
applyStates(diagram,brew);
const generatedText=JSON.stringify({...diagram,_version:3,_exportedAt:new Date().toISOString()},null,2)+"\n";
const checked=parseDiagramJSON(generatedText);
assert.equal(checked.name,"Smart Y BCT");
assert.notEqual(checked.id,source.id);
assert.equal(diagram.nodes.length,29);
assert.equal(diagram.pipes.length,31);
assert(!diagram.nodes.some(n=>["steamBoiler","steamWand","milkPump","milkOutlet","airPump","pulseAirValve","tank"].includes(n.type)));
assert(!diagram.pipes.some(p=>["steam","milk","hotMilk","coldMilk","air"].includes(p.fluidType!)));
const allIds=[diagram.id,...diagram.nodes.map(n=>n.id),...diagram.nodes.flatMap(n=>n.ports.map(p=>p.id)),...diagram.pipes.map(p=>p.id)];
assert.equal(new Set(allIds).size,allIds.length,"Duplicate ID");
const occupied=new Set<string>();
for(const n of diagram.nodes)for(const port of n.ports)assert.equal(port.nodeId,n.id);
for(const p of diagram.pipes)for(const endpoint of [p.fromPortId,p.toPortId]) {assert(endpoint&&ports.has(endpoint),"Missing endpoint");assert(!occupied.has(endpoint),"Port occupied twice");occupied.add(endpoint);}
assert.equal(occupied.size,ports.size,"Unconnected retained port");
for(const c of cases)assert.deepEqual(Object.keys(c.state).sort(),Object.keys(snapshotStates(diagram)).sort(),"Incomplete baseline");
const unchanged=JSON.stringify(checked);
const results=runValidationCases(checked);
assert.equal(JSON.stringify(checked),unchanged,"Runner mutated input");
const repeated=runValidationCases(checked);
assert.deepEqual(results,repeated,"Non-deterministic results");
const noPresentation=structuredClone(checked);
for(const p of noPresentation.pipes){delete p.teachingOverride;p.animated=false;}
assert.deepEqual(results,runValidationCases(noPresentation),"Presentation changed engineering results");
const reordered=structuredClone(checked);reordered.nodes.reverse();reordered.pipes.reverse();
assert.deepEqual(results,runValidationCases(reordered),"Array order changed results");
const badTarget=structuredClone(cases[0]);badTarget.mustStopPipeIds.push("absent-target");
assert.equal(runValidationCase(checked,badTarget).status,"INVALID");
const stuckPump=structuredClone(checked);stuckPump.nodes.find(n=>n.type==="pump")!.fault="pumpStuck";
assert.equal(runValidationCase(stuckPump,cases[2]).status,"FAIL","Positive acceptance must detect a seized pump");
const missingActuator=structuredClone(cases[2]);missingActuator.state.absent={pumpOn:true};
assert.equal(runValidationCase(checked,missingActuator).status,"INVALID");
const structure=collectAdvice(checked).filter(a=>a.category==="structure");
// Reproduce the failed supply case on the unchanged source topology. This is evidence,
// not an excuse to weaken the acceptance assertion or relabel the real flow meter.
const sourceBaseline:PresetStateMap={};
for(const n of source.nodes){
  if(["pump","milkPump","airPump"].includes(n.type))sourceBaseline[n.id]={pumpOn:false};
  if(n.type==="solenoid2")sourceBaseline[n.id]={valveState:"closed"};
  if(n.type==="solenoid3")sourceBaseline[n.id]={valvePath:"off"};
}
const sourceSupplyRepro=runValidationCase(source,{...structuredClone(cases[3]),id:"source_A04_repro",state:{...sourceBaseline,...structuredClone(cases[3].state)}});
const flowMeterControl=structuredClone(checked);
flowMeterControl.nodes.find(n=>n.type==="flowMeter")!.type="filter";
const passThroughControl=runValidationCase(flowMeterControl,cases[3]);
assert.equal(sourceSupplyRepro.status,"FAIL","Re-check the suspected pre-existing source issue");
assert.equal(passThroughControl.status,"PASS","Re-check flow-meter traversal diagnosis");
const engineDiagnosis={sourceSupplyRepro,passThroughControl,explanation:"原图相同断供工况也失败。geometry.ts 的供液递归 passThrough 集合缺少 flowMeter，停流依赖在流量计处中断。仅在隔离的诊断副本中把 flowMeter 换成 filter 后 A04 通过；交付图纸仍保留真正的 flowMeter，未修改引擎。"};
const unresolved=[
  {code:"FLUSH_VALVE_DEFINITION_UNRESOLVED",nodeId:ni(62),message:"保留原图两进一出冲泡冲洗阀及端口；未提供其真实阀位通路表。冲洗/咖啡后排废的精确功能未认证；本轮测试令该阀 off。"},
  {code:"QUALITATIVE_ENGINE_ONLY",message:"验收是 Studio 1.27.0 定性流动模型，不能证明实机温度、流量、余压、双向行为或所有工况。"},
  {code:"INHERITED_PARAMETERS",message:"DN25、动画速度等继承原图，不作为经确认的实物参数。美式水出口 custom 声明未被改成虚构温度/比例。"},
  {code:"LEGACY_SHAPE_DRAIN",nodeId:ni(31),message:"公共排废接口沿用原图两端 shape 的当前引擎通过行为，尚未升级到 v4 显式元件定义。"},
];
const manifest={format:"fluidpath.derivation-manifest",version:1,protocolReference:"FluidPath-图纸规范与AI绘图协议-v0.2.md",source:{path:sourcePath,sha256:expectedHash,diagramId:source.id},output:{name:diagram.name,diagramId:diagram.id,schema:3,appVersion:"1.27.0",sha256:sha(generatedText)},intent:"从 Smart Y BCTMS 派生无蒸汽锅炉、无奶泵及专属支路的 Smart Y BCT；保留咖啡、热水杆、美式水、公共排废。",execution:"受控本地派生器；不是当前 AI 面板对 remove/reconnect 指令的端到端认证。",removedNodes:source.nodes.filter(n=>!keep.has(n.id)).map(n=>({id:n.id,type:n.type,label:n.label})),removedPipes:source.pipes.filter(p=>!diagram.pipes.some(q=>q.id===p.id)).map(p=>({id:p.id,from:p.fromPortId,to:p.toPortId})),edits,renamedNodes:[{id:ni(18),before:source.nodes[18].label,after:node(18).label},{id:ni(1),before:source.nodes[1].label,after:node(1).label}],retainedIdMapping:diagram.nodes.map(n=>({sourceNodeId:n.id,outputNodeId:n.id})),archivedSourceCases:source.settings.validationCases,archivedSourceOverrides:source.settings.scenarioOverrides,unresolved,results,structure};
mkdirSync(outputDir,{recursive:true});
writeFileSync(join(outputDir,"Smart Y BCT.json"),generatedText);
writeFileSync(join(outputDir,"Smart Y BCT-变更与验收.json"),JSON.stringify({...manifest,removedPresentationOverrides,engineDiagnosis},null,2)+"\n");
writeFileSync(join(outputDir,"Smart Y BCT-诊断验收报告.md"),buildDiagnosisReport(checked,"zh",true).markdown);
writeFileSync(join(outputDir,"Smart Y BCT-生成说明.md"),`# Smart Y BCT · 派生图纸与验收说明\n\n本图依据 v0.2 协议，从 Smart Y BCTMS 独立派生。保留原图；新图使用独立 diagram ID 和兼容 Studio 1.25.0 的 v3 文件格式，不把尚未支持的 v4 协议字段冒充为已实现功能。\n\n## 交付内容\n\n- 29 个元件、31 段管路；保留主水泵、热水锅炉、冲泡器、咖啡出口、热水杆、美式冷/热水、公共排废。\n- 移除蒸汽锅炉、蒸汽杆、奶泵、奶罐、奶出口、气泵及专属供水、奶路、蒸汽和排废分支，共 35 个元件、41 段管路。\n- 5 处显式重接已记录在变更清单。公共排废阀虽原名包含“蒸汽”，仍服务咖啡排废，因此保留并改名。其余保留元件、端口和管路沿用稳定 ID。\n- 清理继承的教学显示覆盖；工程验收不依赖动画开关。原图失效验收引用和场景覆盖已归档，未移植为有效案例。\n- 内置 6 套工况：待机、冲泡咖啡、热水杆、美式热水、美式冷水、冲泡阀排废。默认打开为冲泡咖啡。\n\n## 如何打开和检查\n\n在桌面版打开同目录的 Smart Y BCT.json，使用“适合画布”查看全图。通过“工况”切换上述状态；通过“验收”执行已保存的 10 项案例。验收运行在副本上，不修改当前画布状态。详细报告见同目录 Smart Y BCT-诊断验收报告.md。\n\n## 验收结论：9 / 10 通过，不是全工况合格\n\n共 133 项管段断言，其中 124 项通过、9 项失败；结构诊断 0 项问题。关闭主泵、正常咖啡、冷热美式、热水杆和公共排废等已列工况通过。\n\nA04“进水阀关闭、泵仍开启”失败：泵前后已停，但流量计之后 9 段管路仍被 App 判为流动。未定义独立供液或余压工况时，不能把这种持续流动当作合格。本测试不把关泵等同于锅炉无水、无温度，也不评价真实余压下的短暂流出。\n\n${engineDiagnosis.explanation}\n\n此缺陷不是删除奶路和蒸汽支路产生的。本轮保留失败案例和失败报告，未用强制停流、替换真实元件类型或修改期望结果掩盖问题。修复 App 后可直接重跑这份案例。\n\n## 本轮额外检查\n\n- 源文件 SHA-256 始终为 ${expectedHash}，未修改原图。\n- JSON 可导入；元件、端口、管路 ID 唯一；全部管路端点有效；每个保留端口恰接 1 条管；无遗留蒸汽或奶介质管路。\n- 每个验收案例包含完整泵阀基线；重复执行、反转数组顺序、去掉动画/教学覆盖结果一致；执行不修改输入图纸。\n- 不存在的验收管段或执行器被判 INVALID；卡死主泵会使正常冲泡案例 FAIL，证明正向断言能检出故障。\n\n## 尚待确认\n\n${unresolved.map(u=>`- ${u.message}`).join("\n")}\n\n本次是协议约束下的本地受控生成与验证。当前 AI 面板尚不支持删除/重接指令，不能把这次交付视为该面板已完成自然语言自动改图的端到端测试。\n`);
const esc=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");
const svgPipes=diagram.pipes.map(p=>{const pts=pipePolyline(p,diagram.nodes)!;return `<g><title>${esc(p.label||p.id)}</title><path d="${pathD(pts)}" fill="none" stroke="${p.wallColor}" stroke-width="11"/><path d="${pathD(pts)}" fill="none" stroke="${p.fluidColor}" stroke-width="6"/></g>`;}).join("");
const svgNodes=diagram.nodes.map(n=>{const bb=nodeBBox(n);const body=renderToStaticMarkup(createElement("svg",null,createElement(NodeSymbol,{node:n}))).replace(/^<svg>/,"").replace(/<\/svg>$/,"");const portDots=n.ports.map(p=>{const pos=portWorldPos(n,p);return `<circle cx="${pos.x}" cy="${pos.y}" r="4" fill="#fff" stroke="#64748b"/>`;}).join("");return `<g><g transform="translate(${n.x} ${n.y}) rotate(${n.rotation} ${n.width/2} ${n.height/2})">${body}</g>${portDots}<text x="${bb.x+bb.w/2}" y="${bb.y+bb.h+25}" text-anchor="middle" font-size="18" fill="#1e293b" paint-order="stroke" stroke="#f3f7fb" stroke-width="5">${esc(n.label)}</text></g>`;}).join("");
writeFileSync(join(outputDir,"Smart Y BCT-预览.svg"),`<svg xmlns="http://www.w3.org/2000/svg" width="2800" height="1820" viewBox="0 -120 2800 1820"><rect x="0" y="-120" width="2800" height="1820" fill="#f3f7fb"/><g font-family="Arial, PingFang SC, sans-serif"><text x="80" y="-40" font-size="40" font-weight="700" fill="#0f172a">Smart Y BCT</text><text x="80" y="5" font-size="21" fill="#64748b">咖啡 · 热水杆 · 美式水 · 公共排废 ｜ 无蒸汽锅炉 / 无奶路</text>${svgPipes}${svgNodes}<text x="80" y="1670" font-size="18" fill="#64748b">基于 Smart Y BCTMS 派生 · 连线交叉不代表相通 · 当前状态：冲泡咖啡 · 未定义的冲洗阀行为保留待确认</text></g></svg>`);
assert.equal(sha(readFileSync(sourcePath,"utf8")),expectedHash,"Original source changed");
console.log(JSON.stringify({outputDir,nodes:diagram.nodes.length,pipes:diagram.pipes.length,removedNodes:manifest.removedNodes.length,removedPipes:manifest.removedPipes.length,results,structure},null,2));
if(results.some(r=>r.status!=="PASS")||structure.some(s=>s.severity==="error"))process.exitCode=1;
