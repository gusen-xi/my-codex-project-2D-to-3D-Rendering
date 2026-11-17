// A login starts a new design; opening an archived project is always explicit.
export const initialWorkspace = () => ({
 page:'workspace',projectId:null,projectName:'',source:null,sourceName:'',isSample:false,
 recognized:false,rooms:[],roomIndex:0,step:0,tab:'plan',style:'现代简约',height:'',intent:'',
 outputSize:'1536x1024',outputQuality:'medium',confirmed:false,consent:false,camera:{x:.5,y:.8,angle:270},versions:[],selectedVersion:-1,
 reference:'',selection:null,editInstruction:'',editMode:'edit',job:null,zoom:100,review:{}
});
