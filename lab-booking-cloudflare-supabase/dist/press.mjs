// Shared by the timetable and list. Moving or adding a finger cancels a hold.
export function createLongPress({onHold,delay=550,schedule=setTimeout,unschedule=clearTimeout}){
 let timer=null,press=null;
 function cancel(){if(timer!==null)unschedule(timer);timer=null;press=null;}
 return {
  start(point){cancel();press={...point,held:false};timer=schedule(()=>{timer=null;if(press){press.held=true;onHold({...press});}},delay);},
  move(point){if(press&&!press.held&&point.id===press.id&&Math.hypot(point.x-press.x,point.y-press.y)>8)cancel();},
  end(id){if(!press||id!==press.id)return false;const held=press.held;cancel();return held;},
  cancel
 };
}
