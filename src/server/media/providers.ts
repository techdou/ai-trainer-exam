import { Config, HeaderUtils, ImageGenerationClient, TTSClient } from 'coze-coding-dev-sdk';

export interface GeneratedMedia { buffer: Buffer; contentType: string; extension: string; provider: string; metadata: Record<string,unknown> }
async function fetchBytes(url:string):Promise<{buffer:Buffer;contentType:string}>{
  const response=await fetch(url,{signal:AbortSignal.timeout(120_000)});if(!response.ok)throw new Error(`下载生成结果失败：HTTP ${response.status}`);
  return {buffer:Buffer.from(await response.arrayBuffer()),contentType:response.headers.get('content-type')||'application/octet-stream'};
}
function fromDataUrl(value:string):{buffer:Buffer;contentType:string}{
  const match=/^data:([^;]+);base64,(.+)$/s.exec(value);if(!match)throw new Error('生成服务返回了无效的 data URL');return {contentType:match[1],buffer:Buffer.from(match[2],'base64')};
}

export async function generateImage(prompt:string,size:string,headers:Headers):Promise<GeneratedMedia>{
  const base=(process.env.IMAGE2_API_BASE_URL||'').replace(/\/$/,'');
  const key=process.env.IMAGE2_API_KEY;
  if(base&&key){
    const response=await fetch(`${base}/v1/images/generations`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify({model:process.env.IMAGE2_API_MODEL||'gpt-image-1',prompt,size,n:1,response_format:'b64_json'}),signal:AbortSignal.timeout(180_000)});
    const json=await response.json().catch(()=>null) as {data?:Array<{b64_json?:string;url?:string}>;error?:{message?:string}}|null;
    if(!response.ok||!json?.data?.[0])throw new Error(json?.error?.message||`image2-api 调用失败：HTTP ${response.status}`);
    const item=json.data[0]; const bytes=item.b64_json?{buffer:Buffer.from(item.b64_json,'base64'),contentType:'image/png'}:await fetchBytes(item.url!);
    return {...bytes,extension:bytes.contentType.includes('jpeg')?'jpg':'png',provider:'image2-api',metadata:{model:process.env.IMAGE2_API_MODEL||'gpt-image-1',size}};
  }
  const config=new Config();const client=new ImageGenerationClient(config,HeaderUtils.extractForwardHeaders(headers));
  const result=await client.generate({prompt,size:size||'2K'});const helper=client.getResponseHelper(result);
  if(!helper.success||!helper.imageUrls[0])throw new Error(helper.errorMessages.join('; ')||'Coze 图片生成失败');
  const bytes=await fetchBytes(helper.imageUrls[0]);return {...bytes,extension:bytes.contentType.includes('jpeg')?'jpg':'png',provider:'coze-image-generation',metadata:{size}};
}

export async function generateAudio(text:string,speaker:string,headers:Headers):Promise<GeneratedMedia>{
  const endpoint=process.env.MIMO_LECTURE_AUDIO_URL;const key=process.env.MIMO_LECTURE_AUDIO_KEY;
  if(endpoint){
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...(key?{Authorization:`Bearer ${key}`}:{})},body:JSON.stringify({text,speaker,format:'mp3',sampleRate:24000}),signal:AbortSignal.timeout(180_000)});
    const json=await response.json().catch(()=>null) as Record<string,unknown>|null;
    if(!response.ok||!json)throw new Error(`mimo-lecture-audio-skill 调用失败：HTTP ${response.status}`);
    const data=(json.data&&typeof json.data==='object'?json.data:json) as Record<string,unknown>;
    const b64=String(data.audioBase64??data.audio_base64??'');const url=String(data.audioUrl??data.audio_url??data.url??'');
    const bytes=b64?{buffer:Buffer.from(b64.replace(/^data:[^,]+,/,''),'base64'),contentType:'audio/mpeg'}:url.startsWith('data:')?fromDataUrl(url):url?await fetchBytes(url):null;
    if(!bytes)throw new Error('mimo-lecture-audio-skill 未返回音频内容');
    return {...bytes,extension:bytes.contentType.includes('ogg')?'ogg':'mp3',provider:'mimo-lecture-audio-skill',metadata:{speaker}};
  }
  const config=new Config();const client=new TTSClient(config,HeaderUtils.extractForwardHeaders(headers));
  const response=await client.synthesize({uid:'media-studio',text,speaker:speaker||'zh_female_xiaohe_uranus_bigtts',audioFormat:'mp3',sampleRate:24000});
  const uri=String(response.audioUri||'');if(!uri)throw new Error('Coze TTS 未返回音频');
  const bytes=uri.startsWith('data:')?fromDataUrl(uri):await fetchBytes(uri);
  return {...bytes,extension:'mp3',provider:'coze-tts',metadata:{speaker}};
}
