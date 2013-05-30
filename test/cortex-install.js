var Installer = require("../index");

var installer = new Installer();


// installer.installModule("ajax","0.0.x",function(err,json){
//     if(err){console.log(err);return;}
//     console.log(json);
// });

installer.install(["ajax@0.0.x","authbox@0.0.0"],function(err,json){
    if(err){console.log(err);return;}
    console.log(json);
})