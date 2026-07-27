/**
 * 五级实操任务种子数据：练习库和正式考试库物理分离。
 * 运行前先执行 seed-core.mts。正式考试素材仅作为开发夹具，投入考试前必须人工审核。
 */
import pg from 'pg';
import { getDbUrl, loadEnv } from 'coze-coding-dev-sdk';
import { loadEnvLocal } from './_env.mjs';
loadEnv(); loadEnvLocal();
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
  config:{images:[{id:'basket-1',url:'/training/gen/basketball-1.webp',description:'图片 1'},{id:'football-1',url:'/training/gen/football-1.webp',description:'图片 2'},{id:'basket-2',url:'/training/gen/basketball-2.webp',description:'图片 3'}]},
  answer:{correctDecisions:{'basket-1':'keep','football-1':'discard','basket-2':'keep'}}},
 {key:'bbox',type:'image_annotation',title:'图片方框标注：人物、动物和红灯',difficulty:2,
  instructions:'用方框标出人物、动物和红绿灯。红绿灯属性选择“红灯”。坐标按原图归一化保存。',
  config:{imageUrl:'/training/gen/traffic-scene.jpg',targetLabels:['人物','动物','红绿灯'],annotationTool:'bbox',attributes:{红绿灯:['红灯','绿灯']}},
  answer:{iouThreshold:.45,boxes:[{x:.04,y:.38,width:.12,height:.36,label:'人物'},{x:.42,y:.60,width:.18,height:.22,label:'动物'},{x:.88,y:.08,width:.07,height:.26,label:'红绿灯',attributes:{state:'红灯'}}]}},
 {key:'point',type:'point_annotation',title:'图片点标注：红绿灯中心点',difficulty:1,
  instructions:'在红灯中心位置点击一个点，类别选择“红绿灯”，属性选择“红灯”。',
  config:{imageUrl:'/training/gen/traffic-scene.jpg',targetLabels:['红绿灯'],annotationTool:'point',attributes:{红绿灯:['红灯','绿灯']}},
  answer:{distanceTolerance:.08,points:[{x:.91,y:.15,label:'红绿灯',attributes:{state:'红灯'}}]}},
 {key:'polyline',type:'polyline_annotation',title:'图片线框标注：道路中线',difficulty:2,
  instructions:'沿道路中间的白色虚线画一条折线。',
  config:{imageUrl:'/training/gen/traffic-scene.jpg',targetLabels:['道路中线'],annotationTool:'polyline'},
  answer:{distanceTolerance:.08,lines:[{label:'道路中线',points:[{x:.05,y:.865},{x:.25,y:.865},{x:.5,y:.865},{x:.75,y:.865},{x:.95,y:.865}]}]}},
 {key:'polygon',type:'polygon_annotation',title:'图片轮廓标注：动物',difficulty:2,
  instructions:'用多边形沿动物外轮廓进行标注。',
  config:{imageUrl:'/training/gen/traffic-scene.jpg',targetLabels:['动物'],annotationTool:'polygon'},
  answer:{iouThreshold:.4,polygons:[{label:'动物',points:[{x:.44,y:.70},{x:.48,y:.62},{x:.55,y:.62},{x:.60,y:.70},{x:.58,y:.80},{x:.46,y:.80}]}]}},
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
 // ─── 第二轮补齐: 3 种新题型(2026-07-26, 素材由 image2-api / MiMo TTS 生成) ───
 {key:'labeling',type:'data_labeling',title:'图文数据分类标注',difficulty:1,
  instructions:'请把每个条目正确分类为“动物”“植物”或“物品”。',
  config:{labels:['动物','植物','物品'],items:[
   {id:'img-cat',imageUrl:'/training/gen/cat-1.webp',description:'条目 1'},
   {id:'img-dog',imageUrl:'/training/gen/dog-1.webp',description:'条目 2'},
   {id:'img-plant',imageUrl:'/training/gen/plant-1.webp',description:'条目 3'},
   {id:'img-mug',imageUrl:'/training/gen/mug-1.webp',description:'条目 4'},
   {id:'txt-1',content:'一只在院子里奔跑的兔子',description:'条目 5(文本)'}]},
  answer:{correctLabels:{'img-cat':'动物','img-dog':'动物','img-plant':'植物','img-mug':'物品','txt-1':'动物'}}},
 {key:'quality',type:'dataset_quality',title:'数据集质量体检',difficulty:2,
  instructions:'这是一批待入库的训练数据。请逐项检查，勾选所有“有问题”的条目（乱码、重复、空值、图文不符等）。',
  config:{items:[
   {id:'d1',content:'用户评论：这款产品非常好用，已经推荐给朋友了。',description:'文本数据'},
   {id:'d2',content:'用户评论：??????########',description:'文本数据'},
   {id:'d3',content:'用户评论：这款产品非常好用，已经推荐给朋友了。',description:'文本数据'},
   {id:'d4',content:'',description:'文本数据(内容为空)'},
   {id:'d5',content:'图片标签：猫。实际画面：一只金毛犬趴在草地上。',description:'标注数据'}]},
  answer:{correctFlaggedItems:['d2','d3','d4','d5']}},
 {key:'composite',type:'composite_task',title:'数据标注综合考核',difficulty:2,
  instructions:'请依次完成两个子任务：先给评论标注情感，再把文件分进正确的素材文件夹。',
  config:{subtasks:[
   {id:'sentiment',title:'评论情感标注',instructions:'把每条评论标记为好评、中评或差评。',taskType:'text_sentiment',
    config:{labels:['好评','中评','差评'],texts:[{id:'c1',content:'物流很快，包装也很好，会回购。'},{id:'c2',content:'东西一般般吧，无功无过。'}]}},
   {id:'files',title:'素材文件分类',instructions:'把文件放进正确的文件夹。',taskType:'file_classify',
    config:{categories:['图片素材','文档素材'],files:[{id:'f1',name:'street_scene.png',size:'120KB'},{id:'f2',name:'labeling_notes.docx',size:'30KB'}]}}]},
  answer:{subtasks:{
   sentiment:{weight:0.5,graderId:'text_sentiment',answerKey:{correctSentiments:{c1:'好评',c2:'中评'}}},
   files:{weight:0.5,graderId:'file_classify',answerKey:{correctClassifications:{f1:'图片素材',f2:'文档素材'}}}}}},
 // ─── 第三轮补齐: 12 个新实操题（2026-07-27, 覆盖全部评分器, 多难度组合） ───
 {key:'excel2',type:'excel_delete_rows',title:'Excel 数据清洗：商品库存表',difficulty:2,
  instructions:'请逐行检查商品名称。删除名称中含多余空格的行，以及价格明显异常（非数字或为0）的行；不要修改其他数据。',
  config:{columns:['编号','商品名称','价格','库存'],rowIds:['r-01','r-02','r-03','r-04','r-05','r-06','r-07','r-08'],dataRows:[['G001','无线鼠标','89','50'],['G002','机 械 键盘','0','20'],['G003','USB线缆','15','200'],['G004','显示器支架','120','30'],['G005','蓝牙 耳机','199','45'],['G006','桌面台灯','abc','15'],['G007','摄像头','159','25'],['G008','鼠标 垫','25','100']]},
  answer:{correctRetainedRowIds:['r-01','r-03','r-04','r-07'],forbiddenCellChanges:true}},
 {key:'files2',type:'file_classify',title:'多媒体文件类型分类',difficulty:1,
  instructions:'把文件按类型分进对应文件夹：图片文件放"图片素材"，音频文件放"音频素材"，文档文件放"文档素材"。',
  config:{categories:['图片素材','音频素材','文档素材'],files:[{id:'mf-img-1',name:'street_photo.jpg',size:'2.1MB'},{id:'mf-aud-1',name:'interview.mp3',size:'5.4MB'},{id:'mf-doc-1',name:'标注规范.pdf',size:'1.2MB'},{id:'mf-img-2',name:'label_sample.png',size:'340KB'},{id:'mf-aud-2',name:'narration.wav',size:'8.7MB'},{id:'mf-doc-2',name:'项目计划.xlsx',size:'56KB'}]},
  answer:{correctClassifications:{'mf-img-1':'图片素材','mf-aud-1':'音频素材','mf-doc-1':'文档素材','mf-img-2':'图片素材','mf-aud-2':'音频素材','mf-doc-2':'文档素材'}}},
 {key:'images2',type:'image_clean',title:'猫咪图片数据清洗',difficulty:1,
  instructions:'这是猫咪图片数据集。请删除混入的狗图片，保留猫咪图片。',
  config:{images:[{id:'cat-1',url:'/training/gen/cat-1.webp',description:'图片 1'},{id:'dog-1',url:'/training/gen/dog-1.webp',description:'图片 2'},{id:'cat-2',url:'/training/gen/plant-1.webp',description:'图片 3'},{id:'dog-2',url:'/training/gen/dog-1.webp',description:'图片 4'}]},
  answer:{correctDecisions:{'cat-1':'keep','dog-1':'discard','cat-2':'discard','dog-2':'discard'}}},
 {key:'bbox2',type:'image_annotation',title:'图片方框标注：篮球与足球',difficulty:1,
  instructions:'用方框分别标出图中的篮球和足球。每个方框选择正确的类别。',
  config:{imageUrl:'/training/basketball-1.webp',targetLabels:['篮球','足球'],annotationTool:'bbox'},
  answer:{iouThreshold:.45,boxes:[{x:.30,y:.25,width:.40,height:.55,label:'篮球'}]}},
 {key:'point2',type:'point_annotation',title:'图片点标注：篮球中心',difficulty:1,
  instructions:'在篮球的中心位置点击一个点，类别选择"篮球"。',
  config:{imageUrl:'/training/basketball-2.webp',targetLabels:['篮球'],annotationTool:'point'},
  answer:{distanceTolerance:.08,points:[{x:.50,y:.45,label:'篮球'}]}},
 {key:'polyline2',type:'polyline_annotation',title:'图片折线标注：草地分界线',difficulty:2,
  instructions:'沿草地与地面的水平分界线画一条折线，从左到右。',
  config:{imageUrl:'/training/football-1.webp',targetLabels:['草地分界线'],annotationTool:'polyline'},
  answer:{distanceTolerance:.08,lines:[{label:'草地分界线',points:[{x:.05,y:.56},{x:.30,y:.56},{x:.50,y:.56},{x:.70,y:.56},{x:.95,y:.56}]}]}},
 {key:'polygon2',type:'polygon_annotation',title:'图片轮廓标注：篮球',difficulty:2,
  instructions:'用多边形沿篮球的外轮廓进行标注。',
  config:{imageUrl:'/training/basketball-1.webp',targetLabels:['篮球'],annotationTool:'polygon'},
  answer:{iouThreshold:.4,polygons:[{label:'篮球',points:[{x:.30,y:.25},{x:.45,y:.20},{x:.60,y:.25},{x:.68,y:.40},{x:.68,y:.60},{x:.60,y:.75},{x:.45,y:.80},{x:.30,y:.75},{x:.22,y:.60},{x:.22,y:.40}]}]}},
 {key:'sentiment2',type:'text_sentiment',title:'电商评论情感标注（多场景）',difficulty:1,
  instructions:'请把每条评论标记为好评、中评或差评。',
  config:{labels:['好评','中评','差评'],texts:[{id:'s-1',content:'收到货了，质量比预期好很多，包装也很用心！'},{id:'s-2',content:'一般般吧，能用但没觉得有什么特别。'},{id:'s-3',content:'用了两天就坏了，客服态度还差，失望。'},{id:'s-4',content:'性价比很高，已经推荐给同事了。'},{id:'s-5',content:'物流太慢了，等了一周才到，东西还行。'}]},
  answer:{correctSentiments:{'s-1':'好评','s-2':'中评','s-3':'差评','s-4':'好评','s-5':'中评'}}},
 {key:'stats2',type:'stats_table',title:'图片标注量统计填表',difficulty:2,
  instructions:'根据原始记录，填写各类标注目标的数量和标注总数。',
  config:{columns:['统计项目','数量'],rows:[['人物',''],['车辆',''],['动物',''],['交通标志',''],['标注总数','']],editableCells:['B1','B2','B3','B4','B5'],sourceSummary:{targets:['人物','车辆','人物','动物','车辆','车辆','交通标志','人物','动物','交通标志','交通标志','车辆']}},
  answer:{correctCells:{B1:3,B2:5,B3:2,B4:3,B5:13},numericTolerance:0,rejectExtraCells:true}},
 {key:'labeling2',type:'data_labeling',title:'交通场景目标分类标注',difficulty:1,
  instructions:'请把每个条目正确分类为"行人""车辆"或"交通设施"。',
  config:{labels:['行人','车辆','交通设施'],items:[
   {id:'t-1',content:'斑马线上正在过马路的行人',description:'条目 1'},
   {id:'t-2',content:'路口停着的红色出租车',description:'条目 2'},
   {id:'t-3',content:'路边的红色交通信号灯',description:'条目 3'},
   {id:'t-4',content:'骑着共享单车的学生',description:'条目 4'},
   {id:'t-5',content:'高速公路上的限速标志牌',description:'条目 5'}]},
  answer:{correctLabels:{'t-1':'行人','t-2':'车辆','t-3':'交通设施','t-4':'行人','t-5':'交通设施'}}},
 {key:'quality2',type:'dataset_quality',title:'图片标注数据集质量检验',difficulty:2,
  instructions:'检查以下标注数据的质量问题，勾选所有"有问题"的条目（标注错误、框不紧、类别混淆、重复标注等）。',
  config:{items:[
   {id:'q-1',content:'图片：篮球 | 标注：篮球 | IoU:0.92',description:'标注样本'},
   {id:'q-2',content:'图片：足球 | 标注：篮球 | IoU:0.88',description:'标注样本'},
   {id:'q-3',content:'图片：红绿灯 | 标注：红绿灯 | IoU:0.35',description:'标注样本'},
   {id:'q-4',content:'图片：行人 | 标注：行人 | IoU:0.91',description:'标注样本'},
   {id:'q-5',content:'图片：(空) | 标注：篮球 | IoU:N/A',description:'标注样本'}]},
  answer:{correctFlaggedItems:['q-2','q-3','q-5']}},
 {key:'composite2',type:'composite_task',title:'标注质量综合考核',difficulty:3,
  instructions:'请依次完成两个子任务：先判断图片标注质量，再对评论进行情感标注。',
  config:{subtasks:[
   {id:'quality',title:'标注质量判断',instructions:'勾选所有有问题的标注条目。',taskType:'dataset_quality',
    config:{items:[{id:'cq-1',content:'图片：行人 | 标注：行人 | IoU:0.95',description:'标注样本'},{id:'cq-2',content:'图片：车辆 | 标注：行人 | IoU:0.90',description:'标注样本'}]}},
   {id:'sentiment',title:'评论情感标注',instructions:'把每条评论标记为好评、中评或差评。',taskType:'text_sentiment',
    config:{labels:['好评','中评','差评'],texts:[{id:'cs-1',content:'标注工具很好用，操作流畅。'},{id:'cs-2',content:'标注规则不太清楚，需要培训。'}]}}]},
  answer:{subtasks:{
   quality:{weight:0.5,graderId:'dataset_quality',answerKey:{correctFlaggedItems:['cq-2']}},
   sentiment:{weight:0.5,graderId:'text_sentiment',answerKey:{correctSentiments:{'cs-1':'好评','cs-2':'差评'}}}}}},
 // ─── 第四轮补齐: 单元素素材折线/轮廓标注（2026-07-27, image2-api 生成真实照片） ───
 // 坐标为近似估计值, 投入使用前需在后台用标注工具校准。
 {key:'poly-car',type:'polyline_annotation',title:'折线标注：汽车侧视轮廓线',difficulty:2,
  instructions:'沿红色小汽车的侧面轮廓，从车顶前沿开始，顺时针描绘车身外轮廓折线。',
  config:{imageUrl:'/training/gen/car-1.webp',targetLabels:['汽车轮廓'],annotationTool:'polyline'},
  answer:{distanceTolerance:.08,lines:[{label:'汽车轮廓',points:[{x:.22,y:.35},{x:.30,y:.25},{x:.55,y:.22},{x:.70,y:.25},{x:.78,y:.35},{x:.82,y:.50},{x:.80,y:.58},{x:.70,y:.58},{x:.65,y:.65},{x:.60,y:.58},{x:.40,y:.58},{x:.35,y:.65},{x:.30,y:.58},{x:.20,y:.55},{x:.18,y:.45}]}]}},
 {key:'poly-dog',type:'polyline_annotation',title:'折线标注：小狗坐姿背线',difficulty:2,
  instructions:'从小狗头顶沿着背部到尾巴尖，画一条折线描绘小狗的背部轮廓。',
  config:{imageUrl:'/training/gen/dog-solo-1.webp',targetLabels:['小狗背线'],annotationTool:'polyline'},
  answer:{distanceTolerance:.08,lines:[{label:'小狗背线',points:[{x:.42,y:.18},{x:.48,y:.22},{x:.55,y:.30},{x:.60,y:.42},{x:.62,y:.55},{x:.68,y:.50},{x:.72,y:.40},{x:.75,y:.35}]}]}},
 {key:'poly-cat',type:'polyline_annotation',title:'折线标注：猫咪坐姿中线',difficulty:2,
  instructions:'从猫咪两耳之间的头顶中心，沿着鼻梁、胸口到前爪之间，画一条垂直折线。',
  config:{imageUrl:'/training/gen/cat-solo-1.webp',targetLabels:['猫咪中线'],annotationTool:'polyline'},
  answer:{distanceTolerance:.08,lines:[{label:'猫咪中线',points:[{x:.50,y:.15},{x:.50,y:.25},{x:.48,y:.35},{x:.47,y:.50},{x:.48,y:.62},{x:.50,y:.72}]}]}},
 {key:'poly-mushroom',type:'polyline_annotation',title:'折线标注：蘑菇伞盖弧线',difficulty:1,
  instructions:'从蘑菇伞盖左侧边缘开始，沿伞盖顶部弧线画到右侧边缘。',
  config:{imageUrl:'/training/gen/mushroom-1.webp',targetLabels:['蘑菇伞盖'],annotationTool:'polyline'},
  answer:{distanceTolerance:.08,lines:[{label:'蘑菇伞盖',points:[{x:.25,y:.35},{x:.30,y:.25},{x:.40,y:.18},{x:.50,y:.15},{x:.60,y:.18},{x:.70,y:.25},{x:.75,y:.35}]}]}},
 {key:'pgon-car',type:'polygon_annotation',title:'轮廓标注：汽车整体外轮廓',difficulty:2,
  instructions:'用多边形沿红色小汽车的整体外轮廓进行标注，包含车轮。',
  config:{imageUrl:'/training/gen/car-1.webp',targetLabels:['汽车'],annotationTool:'polygon'},
  answer:{iouThreshold:.4,polygons:[{label:'汽车',points:[{x:.18,y:.45},{x:.22,y:.35},{x:.30,y:.25},{x:.55,y:.22},{x:.70,y:.25},{x:.78,y:.35},{x:.82,y:.50},{x:.82,y:.60},{x:.20,y:.60}]}]}},
 {key:'pgon-dog',type:'polygon_annotation',title:'轮廓标注：小狗整体外轮廓',difficulty:3,
  instructions:'用多边形沿小狗的整体外轮廓进行标注，包含头部、身体、四肢和尾巴。',
  config:{imageUrl:'/training/gen/dog-solo-1.webp',targetLabels:['小狗'],annotationTool:'polygon'},
  answer:{iouThreshold:.4,polygons:[{label:'小狗',points:[{x:.35,y:.25},{x:.40,y:.15},{x:.48,y:.12},{x:.55,y:.15},{x:.58,y:.25},{x:.62,y:.40},{x:.72,y:.35},{x:.78,y:.42},{x:.75,y:.55},{x:.68,y:.50},{x:.62,y:.55},{x:.60,y:.72},{x:.55,y:.82},{x:.45,y:.82},{x:.40,y:.72},{x:.35,y:.55},{x:.30,y:.40}]}]}},
 {key:'pgon-cat',type:'polygon_annotation',title:'轮廓标注：猫咪整体外轮廓',difficulty:3,
  instructions:'用多边形沿橘猫的整体外轮廓进行标注，包含头部、身体和尾巴。',
  config:{imageUrl:'/training/gen/cat-solo-1.webp',targetLabels:['猫咪'],annotationTool:'polygon'},
  answer:{iouThreshold:.4,polygons:[{label:'猫咪',points:[{x:.38,y:.28},{x:.42,y:.15},{x:.48,y:.10},{x:.55,y:.10},{x:.60,y:.15},{x:.62,y:.28},{x:.65,y:.42},{x:.72,y:.38},{x:.78,y:.48},{x:.72,y:.55},{x:.68,y:.65},{x:.65,y:.78},{x:.55,y:.85},{x:.42,y:.85},{x:.35,y:.75},{x:.32,y:.60},{x:.30,y:.45}]}]}},
 {key:'pgon-mushroom',type:'polygon_annotation',title:'轮廓标注：蘑菇整体外轮廓',difficulty:1,
  instructions:'用多边形沿蘑菇的整体外轮廓进行标注，包含伞盖和菌柄。',
  config:{imageUrl:'/training/gen/mushroom-1.webp',targetLabels:['蘑菇'],annotationTool:'polygon'},
  answer:{iouThreshold:.4,polygons:[{label:'蘑菇',points:[{x:.25,y:.40},{x:.28,y:.28},{x:.35,y:.18},{x:.45,y:.13},{x:.55,y:.13},{x:.65,y:.18},{x:.72,y:.28},{x:.75,y:.40},{x:.70,y:.42},{x:.65,y:.45},{x:.62,y:.60},{x:.60,y:.75},{x:.55,y:.85},{x:.45,y:.85},{x:.40,y:.75},{x:.38,y:.60},{x:.35,y:.45},{x:.30,y:.42}]}]}},
 // ─── Excel 综合操作题（学生成绩统计表场景） ───
 {key:'excel-comp',type:'excel_comprehensive',title:'Excel 综合操作：学生成绩统计表',difficulty:2,
  instructions:'请使用表格工具栏完成以下操作：1) 设置表格边框；2) 点击"求班级"用公式从学号提取班级；3) 点击"排序"按班级降序、总分降序排列；4) 点击"分类汇总"按班级求各科平均值；5) 标题行填充蓝色；6) 成绩保留两位小数。',
  config:{
   columns:['学号','姓名','班级','语文','数学','英语','生物','地理','历史','政治','总分'],
   rowIds:['s01','s02','s03','s04','s05','s06','s07','s08'],
   dataRows:[
    ['120305','李北大','','85','92','78','88','90','82','76',''],
    ['120203','陈万地','','91','88','95','93','87','90','85',''],
    ['120104','王大力','','76','82','70','72','85','78','80',''],
    ['120205','赵小华','','88','95','92','90','93','86','89',''],
    ['120301','孙明明','','95','91','88','94','86','92','90',''],
    ['120102','周红梅','','70','75','68','72','80','74','77',''],
    ['120302','吴志强','','82','89','85','87','91','83','79',''],
    ['120201','郑秀丽','','93','96','90','95','88','91','94',''],
   ],
   classColumnIndex:2,
   scoreColumnIndices:[3,4,5,6,7,8,9],
   totalColumnIndex:10,
   colorOptions:['蓝色','红色','绿色','黄色'],
  },
  answer:{
   classColumnIndex:2,
   formulaResults:{'s01':'3班','s02':'2班','s03':'1班','s04':'2班','s05':'3班','s06':'1班','s07':'3班','s08':'2班'},
   sortedRowOrder:['s05','s07','s01','s04','s08','s02','s03','s06'],
   headerColor:'蓝色',
   decimalPlaces:2,
   summaryAverages:[
    {key:'3班',averages:{'3':(95+82+85)/3,'4':(91+89+92)/3,'5':(88+85+78)/3,'6':(94+87+88)/3,'7':(86+91+90)/3,'8':(92+83+82)/3,'9':(90+79+76)/3}},
    {key:'2班',averages:{'3':(88+93+91)/3,'4':(95+96+88)/3,'5':(92+90+95)/3,'6':(90+95+93)/3,'7':(93+88+87)/3,'8':(86+91+90)/3,'9':(89+94+85)/3}},
    {key:'1班',averages:{'3':(76+70)/2,'4':(82+75)/2,'5':(70+68)/2,'6':(72+72)/2,'7':(85+80)/2,'8':(78+74)/2,'9':(80+77)/2}},
   ],
   numericTolerance:0.5,
  }},
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
    SELECT $1::varchar,'task_template',$2::varchar,$3,$4::varchar,NOW() WHERE NOT EXISTS(SELECT 1 FROM practice_assignments WHERE cohort_id=$1::varchar AND item_type='task_template' AND item_id=$2::varchar)`,[cohort.id,pId,t.title,actor.id]);
 }
 await db.query('COMMIT');
 console.log(`已写入 ${templates.length} 个练习任务和 ${templates.length} 个独立考试任务。`);
 console.log('正式任务素材为开发夹具，进入正式考试前请在后台逐项人工审核。');
}catch(error){await db.query('ROLLBACK');throw error}finally{await db.end()}
