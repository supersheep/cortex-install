var Installer = require("../index");

var installer = new Installer({
    registry:"http://registry.npm.dp"
});


// installer.installModule("ajax","0.0.x",function(err,json){
//     if(err){console.log(err);return;}
//     console.log(json);
// });

installer.install(["ajax@latest","authbox@0.0.0"],function(err,json,version_map){
    if(err){console.log(err);return;}
    console.log(json,version_map);
})