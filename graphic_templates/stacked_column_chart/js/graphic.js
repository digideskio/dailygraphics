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
        var y0 = 0;

        d.values = [];
        d.total = 0;

        for (var key in d) {
            if (key == 'label' || key == 'values' || key == 'total') {
                continue;
            }

            d[key] = +d[key];

            var y1 = y0 + d[key];
            d.total += d[key];

            d.values.push({
                name: key,
                y0: y0,
                y1: y1,
                val: d[key],
            });

            y0 = y1;
        }
    });
};

/*
 * Render the graphic(s). Called by pym with the container width.
 */
var render = function (containerWidth) {
    containerWidth = containerWidth || DEFAULT_WIDTH;
    isMobile = (containerWidth <= MOBILE_THRESHOLD);

    // Render the chart!
    renderStackedColumnChart();

    // Update iframe
    if (pymChild) {
        pymChild.sendHeight();
    }
};

/*
 * Render a stacked column chart.
 */
var renderStackedColumnChart = function () {
    /*
     * Setup
     */
    var aspectWidth = 16;
    var aspectHeight = 9;
    var aspectRatio = aspectWidth / aspectHeight;

    var valueGap = 6;

    var margins = {
        top: parseInt(LABELS.marginTop || 5, 10),
        right: parseInt(LABELS.marginRight || 5, 10),
        bottom: parseInt(LABELS.marginBottom || 20, 10),
        left: parseInt(LABELS.marginLeft || 30, 10),
    };

    var ticksY = 5;
    var roundTicksFactor = 50;

    if (isMobile) {
        aspectWidth = 4;
        aspectHeight = 3;
    }

    // Clear existing graphic (for redraw)
    var containerElement = d3.select('#stacked-column-chart');
    containerElement.html('');

    /*
     * Create the root SVG element.
     */
    var chartWrapper = containerElement.append('div')
        .attr('class', 'graphic-wrapper');

    // Calculate actual chart dimensions
    var innerWidth = chartWrapper.node().getBoundingClientRect().width;
    var chartWidth = innerWidth - margins.left - margins.right;
    var chartHeight = Math.ceil(innerWidth / aspectRatio) - margins.top - margins.bottom;

    var chartElement = chartWrapper.append('svg')
        .attr({
            width: chartWidth + margins.left + margins.right,
            height: chartHeight + margins.top + margins.bottom,
        })
        .append('g')
            .attr('transform', makeTranslate(margins.left, margins.top));

    /*
     * Create D3 scale objects.
     */
    var xScale = d3.scale.ordinal()
        .domain(_.pluck(DATA, 'label'))
        .rangeRoundBands([0, chartWidth], 0.1);

    var min = d3.min(DATA, function (d) {
        return Math.floor(d.total / roundTicksFactor) * roundTicksFactor;
    });

    if (min > 0) {
        min = 0;
    }

    var max = d3.max(DATA, function (d) {
        return Math.ceil(d.total / roundTicksFactor) * roundTicksFactor;
    });

    var yScale = d3.scale.linear()
        .domain([min, max])
        .rangeRound([chartHeight, 0]);

    var colorScale = d3.scale.ordinal()
        .domain(d3.keys(DATA[0]).filter(function (d) {
            return d != 'label' && d != 'values' && d != 'total';
        }))
        .range(MULTICOLORS);

    /*
     * Render the legend.
     */
    var legend = containerElement.append('ul')
        .attr('class', 'key')
        .selectAll('g')
            .data(colorScale.domain())
        .enter().append('li')
            .attr('class', function (d, i) {
                return 'key-item key-' + i + ' ' + classify(d);
            });

    legend.append('b')
        .style('background-color', function (d) {
            return colorScale(d);
        });

    legend.append('label')
        .text(function (d) {
            return d;
        });

    /*
     * Create D3 axes.
     */
    var xAxis = d3.svg.axis()
        .scale(xScale)
        .orient('bottom')
        .tickFormat(function (d) {
            return d;
        });

    var yAxis = d3.svg.axis()
        .scale(yScale)
        .orient('left')
        .ticks(ticksY)
        .tickFormat(function (d) {
            return d;
        });

    /*
     * Render axes to chart.
     */
    chartElement.append('g')
        .attr('class', 'x axis')
        .attr('transform', makeTranslate(0, chartHeight))
        .call(xAxis);

    chartElement.append('g')
        .attr('class', 'y axis')
        .call(yAxis);

    /*
     * Render grid to chart.
     */
    var yAxisGrid = function () {
        return yAxis;
    };

    chartElement.append('g')
        .attr('class', 'y grid')
        .call(yAxisGrid()
            .tickSize(-chartWidth, 0)
            .tickFormat('')
        );

    /*
     * Render bars to chart.
     */
    var bars = chartElement.selectAll('.bars')
        .data(DATA)
        .enter().append('g')
            .attr('class', 'bar')
            .attr('transform', function (d) {
                return makeTranslate(xScale(d.label), 0);
            });

    bars.selectAll('rect')
        .data(function (d) {
            return d.values;
        })
        .enter().append('rect')
            .attr('y', function (d) {
                if (d.y1 < d.y0) {
                    return yScale(d.y0);
                }

                return yScale(d.y1);
            })
            .attr('width', xScale.rangeBand())
            .attr('height', function (d) {
                return Math.abs(yScale(d.y0) - yScale(d.y1));
            })
            .style('fill', function (d) {
                return colorScale(d.name);
            })
            .attr('class', function (d) {
                return classify(d.name);
            });

    /*
     * Render values to chart.
     */
    bars.selectAll('text')
        .data(function (d) {
            return d.values;
        })
        .enter().append('text')
            .text(function (d) {
                return d.val;
            })
            .attr('class', function (d) {
                return classify(d.name);
            })
            .attr('x', function (d) {
                return xScale.rangeBand() / 2;
            })
            .attr('y', function (d) {
                var textHeight = d3.select(this).node().getBBox().height;
                var barHeight = Math.abs(yScale(d.y0) - yScale(d.y1));

                if (textHeight + valueGap * 2 > barHeight) {
                    d3.select(this).classed('hidden', true);
                }

                var barCenter = yScale(d.y1) + ((yScale(d.y0) - yScale(d.y1)) / 2);

                return barCenter + textHeight / 2;
            })
            .attr('text-anchor', 'middle');
};

/*
 * Initially load the graphic
 * (NB: Use window.load to ensure all images have loaded)
 */
window.onload = onWindowLoaded;
