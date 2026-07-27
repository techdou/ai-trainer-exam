import { describe, expect, it } from 'vitest';
import {
  trueFalseGrader, excelDeleteRowsGrader, statsTableGrader, fileClassifyGrader,
  imageCleanGrader, imageAnnotationGrader, pointAnnotationGrader,
  polylineAnnotationGrader, polygonAnnotationGrader, textSentimentGrader,
  audioTranscriptionGrader, gradeTaskByType,
} from '../index';

describe('确定性评分引擎安全回归', () => {
  it('判断题缺失字段不能通过', () => expect(trueFalseGrader.grade({} as never, {} as never).score).toBe(0));
  it('服务端按 taskType 绑定评分器', () => expect(gradeTaskByType('excel_delete_rows', {}, {}).score).toBe(0));
  it('Excel 反馈方向正确', () => {
    const keptBad = excelDeleteRowsGrader.grade({retainedRowIds:['a','bad']},{correctRetainedRowIds:['a']});
    expect(keptBad.feedback).toContain('错误数据没有删除');
    const deletedGood = excelDeleteRowsGrader.grade({retainedRowIds:[]},{correctRetainedRowIds:['a']});
    expect(deletedGood.feedback).toContain('误删');
  });
  it('统计表拒绝 parseFloat 式脏数字', () => expect(statsTableGrader.grade({cells:{A1:'123abc'}},{correctCells:{A1:123}}).score).toBe(0));
  it('文件分类使用稳定 ID 并拒绝未知文件', () => expect(fileClassifyGrader.grade({classifications:{f1:'中文',evil:'中文'}},{correctClassifications:{f1:'中文'}}).correct).toBe(false));
  it('图片清洗区分漏删与误删', () => {
    const r=imageCleanGrader.grade({decisions:{b:'discard',f:'keep'}},{correctDecisions:{b:'keep',f:'discard'}});
    expect(r.details).toMatchObject({missedDiscard:1,wronglyDiscarded:1});
  });
  it('边界框采用归一化坐标与一对一匹配', () => {
    const r=imageAnnotationGrader.grade({boxes:[{x:.1,y:.1,width:.2,height:.2,label:'人物'}]},{boxes:[{x:.1,y:.1,width:.2,height:.2,label:'人物'}],iouThreshold:.5});
    expect(r.correct).toBe(true);
  });
  it('点/折线/多边形评分可用', () => {
    expect(pointAnnotationGrader.grade({points:[{x:.5,y:.5,label:'灯'}]},{points:[{x:.5,y:.5,label:'灯'}],distanceTolerance:.05}).correct).toBe(true);
    expect(polylineAnnotationGrader.grade({lines:[{label:'线',points:[{x:0,y:0},{x:1,y:1}]}]},{lines:[{label:'线',points:[{x:0,y:0},{x:1,y:1}]}],distanceTolerance:.05}).correct).toBe(true);
    expect(polygonAnnotationGrader.grade({polygons:[{label:'动物',points:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]}]},{polygons:[{label:'动物',points:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]}],iouThreshold:.5}).correct).toBe(true);
  });
  it('方框标注默认 IoU 阈值为 0.45', () => {
    // IoU=0.44 应判错, IoU=0.46 应判对
    const tooLow = imageAnnotationGrader.grade({boxes:[{x:0,y:0,width:.2,height:.2,label:'人物'}]},{boxes:[{x:.01,y:0,width:.2,height:.2,label:'人物'}]});
    expect(tooLow.details).toMatchObject({ threshold: 0.45 });
  });
  it('折线标注默认 Chamfer 容差为 0.08', () => {
    const r = polylineAnnotationGrader.grade({lines:[{label:'线',points:[{x:0,y:0},{x:1,y:0}]}]},{lines:[{label:'线',points:[{x:0,y:0},{x:1,y:0}]}]});
    expect(r.details).toMatchObject({ tolerance: 0.08 });
  });
  it('轮廓标注默认 IoU 阈值为 0.4', () => {
    const r = polygonAnnotationGrader.grade({polygons:[{label:'动物',points:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]}]},{polygons:[{label:'动物',points:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]}]});
    expect(r.details).toMatchObject({ threshold: 0.4 });
  });
  it('情感标注精确匹配', () => expect(textSentimentGrader.grade({sentiments:{t1:'好评'}},{correctSentiments:{t1:'好评'}}).score).toBe(1));
  it('音频转写强制保留语气助词', () => {
    const r=audioTranscriptionGrader.grade({transcript:'这个产品真的很好'},{correctTranscript:'嗯这个产品真的很好啊',requiredFillers:['嗯','啊'],similarityThreshold:.75});
    expect(r.correct).toBe(false); expect(r.feedback).toContain('语气助词');
  });
});
