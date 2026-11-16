export const directions = [
 {name:'东',angle:0},{name:'东南',angle:45},{name:'南',angle:90},{name:'西南',angle:135},
 {name:'西',angle:180},{name:'西北',angle:225},{name:'北',angle:270},{name:'东北',angle:315}
];
export function snapDirection(angle){return ((Math.round((Number(angle)||0)/45)*45)%360+360)%360;}
export function resizeRect(rect,handle,point){
 const min=.02, clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
 let left=rect.x,top=rect.y,right=rect.x+rect.w,bottom=rect.y+rect.h;
 if(handle.includes('w'))left=clamp(point.x,0,right-min);
 if(handle.includes('e'))right=clamp(point.x,left+min,1);
 if(handle.includes('n'))top=clamp(point.y,0,bottom-min);
 if(handle.includes('s'))bottom=clamp(point.y,top+min,1);
 return {x:left,y:top,w:right-left,h:bottom-top};
}
