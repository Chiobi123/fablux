function string(value, name, {min=1,max=500}={}){const v=String(value??'').trim();if(v.length<min)throw Object.assign(new Error(`${name} is required.`),{status:400});if(v.length>max)throw Object.assign(new Error(`${name} is too long.`),{status:400});return v;}
function email(value){const v=string(value,'Email',{max:254}).toLowerCase();if(!/^\S+@\S+\.\S+$/.test(v))throw Object.assign(new Error('Enter a valid email address.'),{status:400});return v;}
function int(value,name,{min=0,max=1000000}={}){const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)throw Object.assign(new Error(`${name} is invalid.`),{status:400});return n;}
module.exports={string,email,int};
