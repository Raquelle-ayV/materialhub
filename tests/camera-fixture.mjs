import QRCode from 'qrcode';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export async function cameraFixture(){
  const width=640,height=480;
  async function frame(qr){
    const image=await QRCode.toBuffer(qr,{width:360,margin:4});
    const rgb=await sharp({create:{width,height,channels:3,background:'white'}}).composite([{input:image,left:140,top:60}]).removeAlpha().raw().toBuffer();
    const pixels=width*height;const out=Buffer.alloc(pixels*1.5);const clamp=v=>Math.max(0,Math.min(255,Math.round(v)));
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=(y*width+x)*3;const r=rgb[i],g=rgb[i+1],b=rgb[i+2];out[y*width+x]=clamp(16+.257*r+.504*g+.098*b);
      if(y%2===0&&x%2===0){const j=(y/2)*(width/2)+x/2;out[pixels+j]=clamp(128-.148*r-.291*g+.439*b);out[pixels+pixels/4+j]=clamp(128+.439*r-.368*g-.071*b);}
    }
    return Buffer.concat([Buffer.from('FRAME\n'),out]);
  }
  const wrong=await frame('REMATERIAL|ZONE|WOOD');const right=await frame('REMATERIAL|ZONE|BOARD_FOAM');
  // One reusable file outside the project: per-run copies used to pile up gigabytes that Vite then had to watch.
  const folder=join(tmpdir(),'rematerial-test-camera');await mkdir(folder,{recursive:true});const path=join(folder,'zones.y4m');
  // A real QR appears in the camera stream: wrong zone for 6s, then correct zone.
  await writeFile(path,Buffer.concat([Buffer.from(`YUV4MPEG2 W${width} H${height} F5:1 Ip A1:1 C420jpeg\n`),...Array(30).fill(wrong),...Array(90).fill(right)]));
  return path;
}
