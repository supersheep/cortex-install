var Installer = require("../index");

var installer = new Installer({
    registry:"http://registry.npm.dp"
});


// installer.installModule("ajax","0.0.x",function(err,json){
//     if(err){console.log(err);return;}
//     console.log(json);
// });

installer.install(["ajax@0.0.x","authbox@0.0.0","ajax@0.0.2"],function(err,json,version_map){
    if(err){console.log(err);return;}
    console.log(json,version_map);
})