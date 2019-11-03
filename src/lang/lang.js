/*
 * Software License Agreement (MIT License)
 *
 * Author: Duke Fong <d@d-l.io>
 */

let trans_hk = {
    'Passwords': '密碼',
    'Open File': '文件導入',
    'Input Text': '字符導入',
    'Reload Page': '刷新頁面',
    'Clean All': '清除所有數據',
    
    'Plaintext': '明文',
    'Use password': '使用密碼',
    'Content': '內容',
    'Files': '文件',
    'Edit': '編輯',
    'Preview': '預覽',
    
    'Reply': '回覆',
    'Add File': '添加文件',
    'Share URL': '分享鏈接',
    'Show URL': '顯示鏈接',
    'Share File': '分享文件',
    'Download File': '下載文件',
    
    'Password List': '密碼列表',
    'Add': '添加',
    'Cancel': '取消',
    'Password Select': '選擇密碼',
    
    'Set': '選擇',
    'Password': '密碼',
    'Insert': '插入',
    'Remove': '刪除',
    
    'Error: only support https': '錯誤：只支持 https',
    'The Base64 string is invalid': 'Base64 字符串無效',
    'File name, use date if empty': '文件名，留空使用日期',
    'Are you sure you want to clean all?': '是否確認清除所有數據？',
    'Clean all finished': '全部清除成功',
    'Please set password': '請設置密碼',
    'Please input text': '請輸入文字',
    'Sharing is not supported': '不支持分享',
    'Copy to clipboard successed': '成功複製到剪切板',
    'File sharing is not supported': '不支持的文件分享',
    'No password suitable, add new password:': '無匹配的密碼，增加新密碼：',
    'Input URL or Base64 string:': '請輸入 URL 或 Base64 字串：',
    'New password:': '新密碼：',
    
    'OK': '好',
    'Switching APP to new version.': '切換 APP 至新版本'
};

// cat lang.js | cconv -f UTF8 -t UTF8-CN
let trans_cn = {
    'Passwords': '密码',
    'Open File': '文件导入',
    'Input Text': '字符导入',
    'Reload Page': '刷新页面',
    'Clean All': '清除所有数据',
    
    'Plaintext': '明文',
    'Use password': '使用密码',
    'Content': '内容',
    'Files': '文件',
    'Edit': '编辑',
    'Preview': '预览',
    
    'Reply': '回覆',
    'Add File': '添加文件',
    'Share URL': '分享链接',
    'Show URL': '显示链接',
    'Share File': '分享文件',
    'Download File': '下载文件',
    
    'Password List': '密码列表',
    'Add': '添加',
    'Cancel': '取消',
    'Password Select': '选择密码',
    
    'Set': '选择',
    'Password': '密码',
    'Insert': '插入',
    'Remove': '删除',
    
    'Error: only support https': '错误：只支持 https',
    'The Base64 string is invalid': 'Base64 字符串无效',
    'File name, use date if empty': '文件名，留空使用日期',
    'Are you sure you want to clean all?': '是否确认清除所有数据？',
    'Clean all finished': '全部清除成功',
    'Please set password': '请设置密码',
    'Please input text': '请输入文字',
    'Sharing is not supported': '不支持分享',
    'Copy to clipboard successed': '成功复制到剪切板',
    'File sharing is not supported': '不支持的文件分享',
    'No password suitable, add new password:': '无匹配的密码，增加新密码：',
    'Input URL or Base64 string:': '请输入 URL 或 Base64 字串：',
    'New password:': '新密码：',
    
    'OK': '好',
    'Switching APP to new version.': '切换 APP 至新版本'
};


let lang = 'en';
if (navigator.language.startsWith('zh')) {
    lang = 'hk';
    if (navigator.language.includes('CN'))
        lang = 'cn';
}

function L(ori, mark=null) {
    if (lang == 'en')
        return ori;
    if (!mark)
        mark = ori;
    let ret = lang == 'hk' ? trans_hk[mark] : trans_cn[mark];
    return ret || ori;
}

export { L };
