function getUrlVars() {
    var vars={};
    var parts=window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi,function(m,key,value){vars[key] = value;});
    return vars;
}

// Setup the favicon based upon the URL vars
var link=document.createElement('link');
link.type='image/x-icon';
link.rel='shortcut icon';
link.href=decodeURIComponent(getUrlVars()['i']);
document.getElementsByTagName('head')[0].appendChild(link);