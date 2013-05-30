var path = require("path")
    , file = require("fs-extra")
    , async = require("async")
    , request = require("request")
    , temp = require("temp")
    , url = require("url")
    , targz = require("tar.gz")
    , _ = require("underscore");


function removeEmptyDir(path){
    if(!file.existsSync(path)){
        return;
    }

    var files = file.readdirSync(path);
    if(!files.length){
        file.removeSync(path)
    }
}

function Installer(opt){
    this.opts = _.extend({
        dir : "web_modules",
        key : "cortexDependencies",
        registry : "registry.npm.dp",
        prefix : ""
    },opt||{});
}


Installer.fn = Installer.prototype;

Installer.fn.isExplicitVersion = function(version){
    return version.split(".").every(function(sub_version){return !isNaN(+sub_version)})
}

Installer.fn.getMatchVersion = function(versions,pattern){
    var version = versions[pattern],
        choices = Object.keys(versions);

    if(version)return version;
}

Installer.fn.getTarballUrl = function(mod,version,dealTarballUrl){
    var self = this;
    var opts = this.opts;
    var explicit = this.isExplicitVersion(version);
    var not_found = new Error("version "+ version +" not found");

    async.waterfall([function(done){
        // request mod
        var mod_url = "http://"+opts.registry+"/"+mod;
        if(explicit){mod_url += ("/" + version);}
        console.log("GET " + mod_url);
        request.get(mod_url,function(err,res,body){
            if(err){return done(err);}
            done(null,mod_url,res,body);
        });
    }/*,function(mod_url,res,body,done){
        if(res.statusCode!=404){return done(null,res,body);}
        request.get(mod_url.replace("/registry/_design/app/_rewrite",""),function(err,res,body){
            if(err){return done(err);}
            done(null,res,body);
        });
    }*/,function(mod_url,res,body,done){
        // check status code
        if(res.statusCode==404){return done(not_found);}
        done(null,JSON.parse(body));
    },function(json,done){
        if(!explicit){
            json = self.getMatchVersion(json.versions,version);
            if(!json){return done(not_found);}
        }

        done(null,json);
    }],function(err,json){
        if(err){return dealTarballUrl(err);}
        dealTarballUrl(null,json.dist.tarball,json);
    });
}

Installer.fn.installModule = function (mod,version,moduleInstalled){
    var self = this
        , temp_path
        , package_json;

    mod = self.opts.prefix + mod;

    async.waterfall([function(done){
        // 获取tarball地址
        self.getTarballUrl(mod,version,function(err,tarball,json){
            if(err){return done(err);}
            package_json = json;
            done(null, tarball);
        });
    },function(tarball,done){
        // 下载tarball
        var filename = url.parse(tarball).path.split("/").reverse()[0]
            , stream = temp.createWriteStream();

        temp_path = stream.path;
        stream.on("close",function(){
            done(null,temp_path);
        });
        console.log("GET",tarball);

        request.get(tarball,function(err,res,body){
            if(res.statusCode==404){
                tarball = tarball.replace("/registry/_design/app/_rewrite","");
                request.get(tarball).pipe(stream);
            }else{
                stream.write(body);
            }
        });
    },function(tarpath,done){
        // 解压
        var dest_dir = path.join(self.opts.dir,mod,package_json.version)
        console.log("extract " + dest_dir);
        new targz().extract(tarpath, dest_dir, function(err){
            if(err){return done(err);}
            done(null);
        });
    },function(){

    }],function(err){
        // 完成
        if(err){return moduleInstalled(err);}
        moduleInstalled(null,package_json);
    });
}

/**
 * 分析依赖，下载
 */
Installer.fn.intstallDependencies = function(dir,all_installed){
    var options = this.opts;

    var packageFile = path.join(dir,"./package.json")
        , packageJSON = file.readJsonSync(packageFile)
        , dependencies
        , mod
        , tasks = [];

    dependencies = packageJSON[options.key]
    if(!dependencies){
        all_installed()
        return;
    }


    /**
     * 安装依赖
     */
    for(mod in dependencies){
        (function(mod,version){
            tasks.push(function(one_installed){
                /**
                 * 安装单个模块
                 * @return {[type]} [description]
                 */
                installModule(mod,version,function(){
                    var node_modules_dir = path.join(dir,NODE_MODULE_DIR)
                        , web_modules_dir = path.join(dir,options.dir)
                        , module_preinstalled_dir = path.join(node_modules_dir,mod)
                        , module_dist_dir = path.join(web_modules_dir,mod,version)

                    /**
                     * 建立文件夹
                     */
                    file.mkdirpSync(module_dist_dir);

                    /**
                     * 拷贝文件
                     * @return {[type]} [description]
                     */
                    file.copy(module_preinstalled_dir,module_dist_dir,function(){
                        intstallDependencies(module_dist_dir,options,one_installed);
                        grunt.log.writeln("copy: ".green 
                            + path.relative(dir,module_preinstalled_dir) 
                            + " -> " 
                            + path.relative(dir,module_dist_dir))
                        file.removeSync(module_preinstalled_dir);
                    });
                });
            });
        })(mod,dependencies[mod]);
    }

    async.series(tasks,all_installed);
}

module.exports = Installer;