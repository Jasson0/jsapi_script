
var path = require('path')

var parentPath = path.resolve(__dirname, '..');
module.exports = {
    //页面入口文件配置
    entry: {
        "codeGen.bundle":__dirname + "/jsapiGenerator.js",
        "codeClean.bundle":__dirname + "/jsapiClean.js",
    },
    target:"node",
    output: {
        path: parentPath + "/jsapi",
        filename: "[name].js"
    }
};
