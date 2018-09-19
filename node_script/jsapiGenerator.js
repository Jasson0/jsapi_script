    const fs = require('fs');
    const path = require('path');
    const ejs = require('ejs');
    const shasum = require('shasum');
function runGen() {

    if (process.argv.length !== 7) {
        console.log(`Usage: node ${process.argv[1]} <define json> <generate dir>`);
        throw new Error("Param error!");;
    }
    const jsonPath = process.argv[2];
    const jsapiGenerateDir = process.argv[3];
    const jsapiBeanDir = process.argv[4];
    const packageName = process.argv[5];
    const rootPath = process.argv[6];

    //const scriptsPath = "./src/main/scripts/jsapi"
    //const definePath=scriptsPath + "/define/JSAPIDefine.json";
    const defineHashPath=`${rootPath}/src/main/scripts/jsapi/JSAPIDefine.json.shasum`;

    const requestBeanDir = jsapiBeanDir+packageName+"/request";
    const responseBeanDir = jsapiBeanDir+packageName+"/response";
    const managerDir = jsapiBeanDir+packageName+"/manager";
    const jsapiDir = jsapiGenerateDir+packageName+"/jsapi";
    const prefix = 'JSApi';

    const newHash = shasum(fs.readFileSync(jsonPath));

    const oldHash = fs.readFileSync(defineHashPath).toString();

    if (newHash !== oldHash) {
        console.log(`JSAPIDefine file has been changed, write new hash`);
        fs.writeFileSync(defineHashPath, newHash);
    } else {
        console.log(`JSAPIDefine file has not been change, exit!`);
        return;
    }

    if (!fs.existsSync(jsonPath)) {
        console.log(`Define json file not found in ${jsonPath}`);
        return;
    }

    const defines = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

    const camelCaseString = (string) => {
        return string.split('_').map(part => {
            return part[0].toUpperCase() + part.slice(1);
        }).join('');
    };

    const lowerCamelCaseString = (string) => {
        const upperString = camelCaseString(string);
        return upperString[0].toLowerCase() + upperString.slice(1);
    };

    const addPropertyName = (modelName, key, propertyNameMap) => {
        propertyNameMap[modelName] = propertyNameMap[modelName] || {};
        propertyNameMap[modelName][key] = lowerCamelCaseString(key);
    };

    const addProtoArray = (protoDefine, propertyNameMap, define, key, modelName, array) => {
        const value = array[0];
        const type = typeof value;
        if (typeof define[key] === 'undefined') {
            define[key] = 'array';
        }
        if (type === 'object') {
            if (Array.isArray(value)) {
                define[key] += ' array';
                addProtoArray(protoDefine, propertyNameMap, define, key, modelName, value);
            } else {
                const childName = `${modelName}${camelCaseString(key)}Item`;
                define[key] = `array ${childName}`;
                addProtoObject(protoDefine, propertyNameMap, childName, value);
            }
        } else {
            define[key] += ` ${type}`;
        }
        addPropertyName(modelName, key, propertyNameMap);
    };

    const addProtoObject = (protoDefine, propertyNameMap, modelName, object) => {
        let define = {};
        Object.keys(object).forEach(key => {
            const value = object[key];
            if (typeof value === 'object') {
                if (Array.isArray(value)) {
                    addProtoArray(protoDefine, propertyNameMap, define, key, modelName, value);
                } else {
                    let childName;
                    if (Object.keys(value).length === 0) {
                        childName = "JsonObject";
                    } else {
                        childName = `${modelName}${camelCaseString(key)}`;
                    }
                    addProtoObject(protoDefine, propertyNameMap, childName, value);
                    define[key] = `object ${childName}`;
                    addPropertyName(modelName, key, propertyNameMap);
                }
            } else {
                define[key] = typeof object[key];
                addPropertyName(modelName, key, propertyNameMap);
            }
        });
        protoDefine[modelName] = define;
    };

    function classExists(name, className) {
        // 检查java文件是否存在
        const mImplName = `${className}.java`;
        return fs.existsSync(path.join(jsapiDir+"/"+name, mImplName));
    }

    const jsManagerDefines = [];

    Object.entries(defines).forEach(([name, info]) => {
        const requestClassName = `${prefix}${camelCaseString(name)}Request`;
        const responseClassName = `${prefix}${camelCaseString(name)}Response`;
        const className = `${prefix}${camelCaseString(name)}`;

        console.log(`start to generate ${name}. class name: ${className}`);
        jsManagerDefines.push({className: className,name: name});
        let propertyNameMap = {};
        let protoRequest = {};
        let protoResponse = {};
        if (info.request) {
            addProtoObject(protoRequest, propertyNameMap, `${className}Request`, info.request, info.request_name_convert || {});
        }
        if (info.response) {
            addProtoObject(protoResponse, propertyNameMap, `${className}Response`, info.response, info.response_name_convert || {});
        }

        const requestRenderInfo = {
            className: requestClassName,
            proto: protoRequest,
            nameMap: propertyNameMap,
            package: (packageName+"/request").substring(1).replace(/\//g,".")
        };

        const responseRenderInfo = {
            className: responseClassName,
            proto: protoResponse,
            nameMap: propertyNameMap,
            package: (packageName+"/response").substring(1).replace(/\//g,".")
        };

        const jsapiInfo = {
            className: `${className}`,
            proto: protoResponse,
            nameMap: propertyNameMap,
            name: name,
            package: packageName.substring(1).replace(/\//g,".")
        };

        // 实现文件渲染
        const implTemplate = fs.readFileSync(`${rootPath}/src/main/scripts/jsapi/template/jsapi_bean.template`);
        const jsapiimplTemplate = fs.readFileSync(`${rootPath}/src/main/scripts/jsapi/template/jsapi.template`);

        const requestImplContent = ejs.render(implTemplate.toString(), requestRenderInfo);
        const responseImplContent = ejs.render(implTemplate.toString(), responseRenderInfo);
        const jsapiImplContent = ejs.render(jsapiimplTemplate.toString(), jsapiInfo);

        mkdirsSync(`${requestBeanDir}`);
        fs.writeFileSync(`${requestBeanDir}/${className}Request.java`, requestImplContent);

        mkdirsSync(`${responseBeanDir}`);
        fs.writeFileSync(`${responseBeanDir}/${className}Response.java`, responseImplContent);

        if (!classExists(name,className)) {
            if (fsExistsSync(`${jsapiDir}/${name}`)) {
                fs.writeFileSync(`${jsapiDir}/${name}/${className}.java`, jsapiImplContent);
            } else {
                mkdirsSync(`${jsapiDir}/${name}`);
                fs.writeFileSync(`${jsapiDir}/${name}/${className}.java`, jsapiImplContent);
            }
            console.log(`finish to generate ${name}. class name: ${className}`);
        } else {
            console.log(`${name} file has exists, skip the generation`);
        }
    });

    const jsManagerInfo = {
        defines: jsManagerDefines,
        package: packageName.substring(1).replace(/\//g,".")
    };

    const jsManagerImplTemplate = fs.readFileSync(`./template/jsManager.template`);
    const jsapiImplContent = ejs.render(jsManagerImplTemplate.toString(), jsManagerInfo);

    mkdirsSync(`${managerDir}`);
    fs.writeFileSync(`${managerDir}/JSApiManager.java`, jsapiImplContent);
}
runGen();
//检测文件或者文件夹存在 nodeJS
function fsExistsSync(path) {
    try{
        fs.accessSync(path,fs.F_OK);
    }catch(e){
        return false;
    }
    return true;
}

function mkdirsSync(dirname) {
    //console.log(dirname);
    if (fs.existsSync(dirname)) {
        return true;
    } else {
        if (mkdirsSync(path.dirname(dirname))) {
            fs.mkdirSync(dirname);
            return true;
        }
    }
}