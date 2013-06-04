var path = require("path")
    , file = require("fs-extra")
    , async = require("async")
    , request = require("request")
    , temp = require("temp")
    , url = require("url")
    , targz = require("tar.gz")
    , semver = require("semver")
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
        registry : "http://registry.npmjs.org",
        prefix : ""
    },opt||{});
}


Installer.fn = Installer.prototype;

Installer.fn.isExplicitVersion = function(version){
    if(!version){return false;}
    return version.split(".").every(function(sub_version){return !_.isNaN(+sub_version)})
}


Installer.fn.getMatchVersion = function(avaibles,pattern){
    var choices = Object.keys(avaibles);

    var versions = choices.filter(function(choice){
        return semver.satisfies(choice, pattern);
    });

    if(versions.length){
        return avaibles[choices[versions.length-1]];
    }else{
        return null;
    }
}

Installer.fn.getTarballUrl = function(mod,version,dealTarballUrl){
    var self = this;
    var opts = this.opts;
    var explicit = this.isExplicitVersion(version);
    var not_found = new Error(mod + " version "+ version +" not found");

    async.waterfall([function(done){


        // request mod
        var mod_url = opts.registry + "/" + mod;

        if(mod_url.indexOf('://') === -1){
            mod_url = 'http://' + mod_url;
        }

        if(explicit){mod_url += ("/" + version);}
        console.log("GET " + mod_url);
        request.get(mod_url,function(err,res,body){
            if(err){return done(err);}
            done(null,mod_url,res,body);
        });
    },function(mod_url,res,body,done){
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
    }],function(err){
        // 完成
        if(err){return moduleInstalled(err);}

        moduleInstalled(null,package_json);
    });
}

/**
 * 分析依赖，下载
 */
Installer.fn.install = function(mods,all_installed,ret){
    var self = this
        , count = mods.length
        , version_map = {};    

    ret = ret || {};

    /**
     * {a:1,b:2} -> ["a@1","b@2"]
     */
    function dependenciesToMods(obj){
        var ret = []
        for(var i in obj){
            ret.push(i+"@"+obj[i]);
        }
        return ret;
    }

    function done_one(err,json){
        if(err){return all_installed(err);}
        count--;
        var name = json.name
            , version = json.version;

        ret[name] = ret[name] || {};
        ret[name][version] = json;
        
        version_map[json.name] = version;
        if(count == 0){
            all_installed(null,ret,version_map);
        }
    }

    mods.forEach(function(mod,i){
        var splited = mod.split("@")
            , name = splited[0]
            , version = splited[1];

        version = version || "";
        self.installModule(name,version,function(err,package_json){
            if(err){return all_installed(err);}

            var dep = package_json[self.opts.key];
            if(dep){
                self.install(dependenciesToMods(dep),function(err,deps){
                    done_one(err,package_json);
                },ret);
            }else{
                done_one(err,package_json);
            }
        });

    });
}

module.exports = Installer;