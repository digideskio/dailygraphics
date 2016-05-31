// Global vars
var pymChild = null;
var isMobile = false;

/*
 * Initialize the graphic.
 */
var onWindowLoaded = function () {
    if (Modernizr.svg) {
        formatData();

        pymChild = new pym.Child({
            renderCallback: render,
        });
    } else {
        pymChild = new pym.Child({});
    }
};

/*
 * Format graphic data for processing by D3.
 */
var formatData = function () {
    DATA.forEach(function (d) {
        d.amt = +d.amt;
    });
};

/*
 * Render the graphic(s). Called by pym with the container width.
 */
var render = function (containerWidth) {
    containerWidth = containerWidth || DEFAULT_WIDTH;
    isMobile = (containerWidth <= MOBILE_THRESHOLD);

    // Render the chart!
    renderPieChart();

    // Update iframe
    if (pymChild) {
        pymChild.sendHeight();
    }
};

/*
 * Render a pie chart.
 */
var renderPieChart = function () {
    /*
     * Setup
     */
    var margins = {
        top: parseInt(LABELS.marginTop || 0, 10),
        right: parseInt(LABELS.marginRight || 15, 10),
        bottom: parseInt(LABELS.marginBottom || 20, 10),
        left: parseInt(LABELS.marginLeft || 15, 10),
    };

    // Clear existing graphic (for redraw)
    var containerElement = d3.select('#pie-chart');
    containerElement.html('');

    /*
     * Create the root SVG element.
     */
    var chartWrapper = containerElement.append('div')
        .attr('class', 'graphic-wrapper');

    // Calculate actual chart dimensions
    var innerWidth = chartWrapper.node().getBoundingClientRect().width;
    var chartWidth = innerWidth - margins.left - margins.right;
    var chartHeight = chartWidth;

    var chartElement = chartWrapper.append('svg')
        .attr({
            width: chartWidth + margins.left + margins.right,
            height: chartHeight + margins.top + margins.bottom,
        })
        .append('g')
            .attr('transform', makeTranslate(margins.left, margins.top));

    var overlay = chartElement.append('rect')
        .attr({
            width: chartWidth,
            height: chartHeight,
            fill: 'transparent',
        });

    var colorList = colorArray(LABELS, MULTICOLORS);
    var colorScale = d3.scale.ordinal()
        .range(colorList);

    var radius = chartWidth / 2 - 10;
    var arc = d3.svg.arc()
        .outerRadius(radius)
        .innerRadius(0);

    var pie = d3.layout.pie()
        .sort(null)
        .value(function (d) { return d.amt; });

    var g = chartElement.selectAll('.arc')
        .data(pie(DATA))
        .enter().append('g')
        .attr('class', 'arc')
        .attr('transform', makeTranslate((chartWidth / 2), chartHeight / 2));

    g.append('path')
        .attr('d', arc)
        .style('fill', function (d, i) { return colorScale(i); });

    if (LABELS.showLabels) {
        g.append('text')
            .attr('transform', function (d) {
                return 'translate(' + arc.centroid(d) + ')';
            })
            .style('text-anchor', 'middle')
            .attr('fill', 'white')
            .text(function (d) {
                return d.data.label;
            });
    }
};

/*
 * Initially load the graphic
 * (NB: Use window.load to ensure all images have loaded)
 */
window.onload = onWindowLoaded;
