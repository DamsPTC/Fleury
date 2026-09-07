// ZIP "store" format: no compression or third-party runtime. One bounded archive at a time.
const table = Uint32Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
export function crc32(data:Uint8Array) {let c=0xffffffff;for(const b of data)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function header(n:number){const a=new Uint8Array(n);return {a,v:new DataView(a.buffer)};}
export function zip(files:{name:string,data:Uint8Array}[]) {
 const parts:BlobPart[]=[], central:BlobPart[]=[];let offset=0,centralSize=0;
 for(const f of files){const name=new TextEncoder().encode(f.name), crc=crc32(f.data),h=header(30),c=header(46);
 h.v.setUint32(0,0x04034b50,true);h.v.setUint16(4,20,true);h.v.setUint16(6,0x800,true);h.v.setUint16(12,33,true);h.v.setUint32(14,crc,true);h.v.setUint32(18,f.data.length,true);h.v.setUint32(22,f.data.length,true);h.v.setUint16(26,name.length,true);
 parts.push(h.a as BlobPart,name as BlobPart,f.data as BlobPart);
 c.v.setUint32(0,0x02014b50,true);c.v.setUint16(4,20,true);c.v.setUint16(6,20,true);c.v.setUint16(8,0x800,true);c.v.setUint16(14,33,true);c.v.setUint32(16,crc,true);c.v.setUint32(20,f.data.length,true);c.v.setUint32(24,f.data.length,true);c.v.setUint16(28,name.length,true);c.v.setUint32(42,offset,true);
 central.push(c.a as BlobPart,name as BlobPart);centralSize+=46+name.length;offset+=30+name.length+f.data.length;
 }
 const end=header(22);end.v.setUint32(0,0x06054b50,true);end.v.setUint16(8,files.length,true);end.v.setUint16(10,files.length,true);end.v.setUint32(12,centralSize,true);end.v.setUint32(16,offset,true);
 return new Blob([...parts,...central,end.a as BlobPart],{type:'application/zip'});
}
