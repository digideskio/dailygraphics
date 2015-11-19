var COLORS = {
    'red1': '#6C2315', 'red2': '#A23520', 'red3': '#D8472B', 'red4': '#E27560', 'red5': '#ECA395', 'red6': '#F5D1CA',
    'orange1': '#714616', 'orange2': '#AA6A21', 'orange3': '#E38D2C', 'orange4': '#EAAA61', 'orange5': '#F1C696', 'orange6': '#F8E2CA',
    'yellow1': '#77631B', 'yellow2': '#B39429', 'yellow3': '#EFC637', 'yellow4': '#F3D469', 'yellow5': '#F7E39B', 'yellow6': '#FBF1CD',
    'teal1': '#0B403F', 'teal2': '#11605E', 'teal3': '#17807E', 'teal4': '#51A09E', 'teal5': '#8BC0BF', 'teal6': '#C5DFDF',
    'blue1': '#28556F', 'blue2': '#3D7FA6', 'blue3': '#51AADE', 'blue4': '#7DBFE6', 'blue5': '#A8D5EF', 'blue6': '#D3EAF7'
};

var PTYCOLORS = {
    'ptyalp': '#C04745',
    'ptylab': '#C04745',
    'ptylib': '#4776BE',
    'ptylnp': '#4776BE',
    'ptynat': '#009966',
    'ptygrn': '#86AB00',
};

var multiColors = [
    "#1F79CD",
    "#FF7C0A",
    "#00B3A7",
    "#D662B1",
    "#71A12D",
    "#926CB5",
    "#F55446"
];

var monochromeColors = [
    "#1B79CC",
    "#47A6FF",
    "#136C9C",
    "#8796A1",
    "#2B4E78",
    "#5686B0",
    "#5E6F7A"
];

var singleColors = [
    "#478CCC"
];

var highlightColors = [
    "#CCCCCC"
];

var highlightColor = '#478CCC';

/*
 * Convert arbitrary strings to valid css classes.
 * via: https://gist.github.com/mathewbyrne/1280286
 *
 * NOTE: This implementation must be consistent with the Python classify
 * function defined in base_filters.py.
 */
var classify = function(str) {
    return str.toLowerCase()
        .replace(/\s+/g, '-')           // Replace spaces with -
        .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
        .replace(/\-\-+/g, '-')         // Replace multiple - with single -
        .replace(/^-+/, '')             // Trim - from start of text
        .replace(/-+$/, '');            // Trim - from end of text
}

/*
 * Convert key/value pairs to a style string.
 */
var formatStyle = function(props) {
    var s = '';

    for (var key in props) {
        s += key + ': ' + props[key].toString() + '; ';
    }

    return s;
}

/*
 * Create a SVG tansform for a given translation.
 */
var makeTranslate = function(x, y) {
    var transform = d3.transform();

    transform.translate[0] = x;
    transform.translate[1] = y;

    return transform.toString();
}

/*
 * Parse a url parameter by name.
 * via: http://stackoverflow.com/a/901144
 */
var getParameterByName = function(name) {
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
        results = regex.exec(location.search);
    return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}

/*
 * Convert a url to a location object.
 */
var urlToLocation = function(url) {
    var a = document.createElement('a');
    a.href = url;
    return a;
}

var colorArray = function (config, d) {
    var c = d;
    if (config.theme) {
        if (graphicConfig.theme == "monochrome") {
            c = monochromeColors;
        }

        if (graphicConfig.theme == "multicolor") {
            c = multiColors;
        }

        if (graphicConfig.theme == "single") {
            c = singleColors;
        }

        if (graphicConfig.theme == "highlight" || graphicConfig.theme == "highlighted") {
            c = highlightColors;
        }
    } else if (config.colors) {
        c = config.colors.split(/\s*,\s*/);
    }

    for (var i = 0; i < c.length; ++i) {
        var color = c[i];
        if (color in PTYCOLORS) {
            c[i] = PTYCOLORS[color];
        }
    }

    return c;
}