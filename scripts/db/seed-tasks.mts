/**
 * 五级实操任务种子数据：练习库和正式考试库物理分离。
 * 运行前先执行 seed-core.mts。正式考试素材仅作为开发夹具，投入考试前必须人工审核。
 */
import pg from 'pg';
import { getDbUrl, loadEnv } from 'coze-coding-dev-sdk';
loadEnv();
const db = new pg.Client({ connectionString: await getDbUrl() }); await db.connect();
const q = async <T,>(sql:string, values:unknown[]=[]):Promise<T[]> => (await db.query(sql,values)).rows as T[];
const org=(await q<{id:string}>(`SELECT id FROM organizations WHERE status='active' ORDER BY created_at LIMIT 1`))[0];
const cohort=(await q<{id:string}>(`SELECT id FROM cohorts WHERE organization_id=$1 AND status='active' ORDER BY created_at LIMIT 1`,[org?.id]))[0];
const actor=(await q<{id:string}>(`SELECT p.id FROM profiles p JOIN user_roles r ON r.user_id=p.id WHERE (r.role='school_admin' OR r.role='super_admin') AND (p.organization_id=$1 OR p.organization_id IS NULL) ORDER BY r.role='school_admin' DESC LIMIT 1`,[org?.id]))[0];
if(!org||!cohort||!actor)throw new Error('请先执行 seed-core.mts，确保机构、班级和管理员存在');

type Template={key:string;type:string;title:string;instructions:string;config:Record<string,unknown>;answer:Record<string,unknown>;grading?:Record<string,unknown>;difficulty?:number};
const templates:Template[]=[
 {key:'excel',type:'excel_delete_rows',title:'Excel 数据清洗：删除含空格和错误人名的行',difficulty:1,
  instructions:'请逐行检查姓名。删除姓名中含空格的行，以及不在正确名单中的错误人名行；不要修改其他数据。',
  config:{columns:['编号','姓名','联系电话','备注'],rowIds:['row-001','row-002','row-003','row-004','row-005','row-006'],dataRows:[['001','张三','13800000001','完整'],['002','李 四','13800000002','姓名含空格'],['003','王五','13800000003','完整'],['004','王武','13800000004','错误人名'],['005','赵六','13800000005','完整'],['006','钱 七','13800000006','姓名含空格']]},
  answer:{correctRetainedRowIds:['row-001','row-003','row-005'],forbiddenCellChanges:true}},
 {key:'files',type:'file_classify',title:'中英文文件名分类',difficulty:1,
  instructions:'把英文命名文件放进“英语文件夹”，把中文命名文件放进“中文文件夹”。',
  config:{categories:['中文文件夹','英语文件夹'],files:[{id:'file-cn-1',name:'培训名单.xlsx',size:'18KB'},{id:'file-en-1',name:'student_list.xlsx',size:'21KB'},{id:'file-cn-2',name:'考试说明.docx',size:'35KB'},{id:'file-en-2',name:'exam_guide.docx',size:'42KB'},{id:'file-cn-3',name:'红绿灯图片.png',size:'180KB'},{id:'file-en-3',name:'traffic_light.png',size:'172KB'}]},
  answer:{correctClassifications:{'file-cn-1':'中文文件夹','file-en-1':'英语文件夹','file-cn-2':'中文文件夹','file-en-2':'英语文件夹','file-cn-3':'中文文件夹','file-en-3':'英语文件夹'}}},
 {key:'images',type:'image_clean',title:'篮球图片数据清洗',difficulty:1,
  instructions:'这是篮球图片数据集。请删除混入的足球图片，保留篮球图片。',
  config:{images:[{id:'basket-1',url:'/training/basketball-1.svg',description:'图片 1'},{id:'football-1',url:'/training/football-1.svg',description:'图片 2'},{id:'basket-2',url:'/training/basketball-2.svg',description:'图片 3'}]},
  answer:{correctDecisions:{'basket-1':'keep','football-1':'discard','basket-2':'keep'}}},
 {key:'bbox',type:'image_annotation',title:'图片方框标注：人物、动物和红灯',difficulty:2,
  instructions:'用方框标出人物、动物和红绿灯。红绿灯属性选择“红灯”。坐标按原图归一化保存。',
  config:{imageUrl:'/training/traffic-scene.svg',targetLabels:['人物','动物','红绿灯'],annotationTool:'bbox',attributes:{红绿灯:['红灯','绿灯']}},
  answer:{iouThreshold:.45,boxes:[{x:.145,y:.345,width:.27,height:.61,label:'人物'},{x:.37,y:.45,width:.25,height:.37,label:'动物'},{x:.65,y:.12,width:.15,height:.47,label:'红绿灯',attributes:{state:'红灯'}}]}},
 {key:'point',type:'point_annotation',title:'图片点标注：红绿灯中心点',difficulty:1,
  instructions:'在红灯中心位置点击一个点，类别选择“红绿灯”，属性选择“红灯”。',
  config:{imageUrl:'/training/traffic-scene.svg',targetLabels:['红绿灯'],annotationTool:'point',attributes:{红绿灯:['红灯','绿灯']}},
  answer:{distanceTolerance:.08,points:[{x:.728,y:.232,label:'红绿灯',attributes:{state:'红灯'}}]}},
 {key:'polyline',type:'polyline_annotation',title:'图片线框标注：道路中线',difficulty:2,
  instructions:'沿道路中间的白色虚线画一条折线。',
  config:{imageUrl:'/training/traffic-scene.svg',targetLabels:['道路中线'],annotationTool:'polyline'},
  answer:{distanceTolerance:.08,lines:[{label:'道路中线',points:[{x:.03,y:.85},{x:.25,y:.85},{x:.5,y:.85},{x:.75,y:.85},{x:.97,y:.85}]}]}},
 {key:'polygon',type:'polygon_annotation',title:'图片轮廓标注：动物',difficulty:2,
  instructions:'用多边形沿动物外轮廓进行标注。',
  config:{imageUrl:'/training/traffic-scene.svg',targetLabels:['动物'],annotationTool:'polygon'},
  answer:{iouThreshold:.4,polygons:[{label:'动物',points:[{x:.37,y:.57},{x:.43,y:.49},{x:.55,y:.48},{x:.61,y:.58},{x:.58,y:.72},{x:.43,y:.75},{x:.36,y:.67}]}]}},
 {key:'sentiment',type:'text_sentiment',title:'评论情感标注',difficulty:1,
  instructions:'请把每条评论标记为好评、中评或差评。',
  config:{labels:['好评','中评','差评'],texts:[{id:'text-1',content:'课程讲得很清楚，我学会了基本操作。'},{id:'text-2',content:'内容一般，能听懂，但练习还可以再多一点。'},{id:'text-3',content:'页面经常出错，体验很差。'}]},
  answer:{correctSentiments:{'text-1':'好评','text-2':'中评','text-3':'差评'}}},
 {key:'audio',type:'audio_transcription',title:'音频转文字：保留语气助词',difficulty:1,
  instructions:'播放音频，把听到的全部内容写下来。“嗯、啊、哦”等语气助词也要写上。',
  config:{audioUrl:'/training/transcription-demo.wav'},
  answer:{correctTranscript:'嗯，今天天气很好啊，我们一起学习人工智能训练师课程哦。',similarityThreshold:.82,requiredFillers:['嗯','啊','哦']}},
 {key:'stats',type:'stats_table',title:'运维统计填表',difficulty:1,
  instructions:'根据原始记录，填写好评、中评、差评、红灯、绿灯、缺失数据和完整数据数量。',
  config:{columns:['统计项目','数量'],rows:[['好评',''],['中评',''],['差评',''],['红灯',''],['绿灯',''],['缺失数据',''],['完整数据','']],editableCells:['B1','B2','B3','B4','B5','B6','B7'],sourceSummary:{reviews:['好评','好评','好评','中评','差评'],trafficLights:['红灯','绿灯','红灯','红灯'],records:['完整','完整','缺失','完整','缺失','完整']}},
  answer:{correctCells:{B1:3,B2:1,B3:1,B4:3,B5:1,B6:2,B7:4},numericTolerance:0,rejectExtraCells:true}},
];
const practiceIds:Record<string,string>={},examIds:Record<string,string>={};
try{
 await db.query('BEGIN');
 for(const [index,t] of templates.entries()){
  const pId=`10000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`; const eId=`20000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`;
  practiceIds[t.key]=pId;examIds[t.key]=eId;
  await db.query(`INSERT INTO practice_task_templates(id,organization_id,task_type,title,instructions,difficulty,config,answer_key,grading_config,practice_only,review_status,published_version,created_at,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true,'published',1,NOW(),NOW()) ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,instructions=EXCLUDED.instructions,config=EXCLUDED.config,answer_key=EXCLUDED.answer_key,grading_config=EXCLUDED.grading_config,review_status='published',updated_at=NOW()`,[pId,org.id,t.type,t.title,t.instructions,t.difficulty??1,t.config,t.answer,t.grading??{}]);
  await db.query(`INSERT INTO exam_task_templates(id,organization_id,task_type,title,instructions,difficulty,config,answer_key,grading_config,practice_only,eligible_for_formal_exam,review_status,published_version,created_at,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,false,true,'published',1,NOW(),NOW()) ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,instructions=EXCLUDED.instructions,config=EXCLUDED.config,answer_key=EXCLUDED.answer_key,grading_config=EXCLUDED.grading_config,eligible_for_formal_exam=true,review_status='published',updated_at=NOW()`,[eId,org.id,t.type,t.title,t.instructions,t.difficulty??1,t.config,t.answer,t.grading??{}]);
  await db.query(`INSERT INTO practice_assignments(cohort_id,item_type,item_id,title,assigned_by,created_at)
    SELECT $1,'task_template',$2,$3,$4,NOW() WHERE NOT EXISTS(SELECT 1 FROM practice_assignments WHERE cohort_id=$1 AND item_type='task_template' AND item_id=$2)`,[cohort.id,pId,t.title,actor.id]);
 }
 await db.query('COMMIT');
 console.log(`已写入 ${templates.length} 个练习任务和 ${templates.length} 个独立考试任务。`);
 console.log('正式任务素材为开发夹具，进入正式考试前请在后台逐项人工审核。');
}catch(error){await db.query('ROLLBACK');throw error}finally{await db.end()}
