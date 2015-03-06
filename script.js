
var UnitConverter = function () { this.init.apply(this, arguments) };
UnitConverter.prototype = {
	init : function (opts) {
		if (!opts) opts = {};
		this.setDPI(opts.dpi || 96);
	},

	setDPI : function (dpi) {
		this.dpi = dpi;
		var dpmm = dpi / 25.4;
		var pt = dpi / 72;
		this.units = {
			'in' : dpi,
			'pt' : pt,
			'mm' : dpmm,
			'cm' : dpmm * 10,
			'm' : dpmm * 1000
		};

		var unitNames = [];
		for (var key in this.units) if (this.units.hasOwnProperty(key)) {
			unitNames.push(key);
		}

		this.re = new RegExp('([0-9.]+) (' + unitNames.join('|') + ')');
	},

	unit : function (string) {
		if (string.match(new RegExp('^' + this.re.source + '$'))) {
			return +RegExp.$1 * this.units[RegExp.$2];
		} else {
			return null;
		}
	},

	context : function (fun) {
		var self = this;
		var args = Array.prototype.slice.call(arguments, 1);
		fun = eval('(' + fun.toString().replace(new RegExp("'(" + this.re.source + ")'", 'g'), function (_, s) {
			return self.unit(s);
		}) + ')');
		fun.apply(null ,args);
	}
};



var App = angular.module('App', []);


App.directive('sharebutton', function () {
	return function (scope, elem, attrs) {
		elem.
			on("click", function () {
				window.open(attrs.href,  '', 'menubar=no,toolbar=no,resizable=yes,scrollbars=yes,height=600,width=600');
				return false;
			});
	};
});


App.directive('selectonfocus', function () {
	return function (scope, elem, attrs) {
		elem.
			on("click focus", function () {
				elem.select();
			}).
			on("mouseup", function () {
				return false;
			});

	};
});

App.factory('location', function () {
	return Location.parse(location.href);
});


App.config(function ($sceProvider, $compileProvider) {
	$sceProvider.enabled(false);
	$compileProvider.aHrefSanitizationWhitelist(/^\s*(https?|ftp|mailto|data|blob):/);
});

App.controller('MainCtrl', function ($scope, $sce, $timeout, $q, location) {
	var canvas = document.getElementById('canvas');
	var converter = new UnitConverter({ dpi : 100 });

	$scope.VARIABLE_DEFINITION = [
		{
			name: "width",
			desc: "幅",
			unit: "cm"
		},
		{
			name: "height",
			desc: "高さ",
			unit: "cm"
		},
		{
			name: "text",
			desc: "文字列",
			type: "text"
		},
		{
			name: "font",
			desc: "フォント",
			type: "text"
		}
	];

	$scope.variables = {
		width: location.params('width') || '150',
		height: location.params('height') || '75',
		font: location.params('font') || 'bold 1200pt sans-serif',
		text: location.params('text') || 'こんにちは世界'
	};

	var timer;
	$scope.$watch('variables', function () {
		console.log('changed');
		console.log($scope.variables);
		converter.context(render, canvas, $scope.variables);

		$scope.download = "";
		clearTimeout(timer);
		timer = setTimeout(function me () {
			if ($scope.progress) {
				timer = setTimeout(me);
				return;
			}
			$scope.generatePrint();
		}, 1000);
	}, true);

	function render (canvas, vars) {
		canvas.setAttribute('width',  vars.width * '1 cm');
		canvas.setAttribute('height', vars.height * '1 cm');

		var ctx = canvas.getContext('2d');

		ctx.lineWidth = '5 pt';
		ctx.strokeRect(0, 0, canvas.width, canvas.height);
		ctx.font = vars.font;

		/*
		var d = document.createElement("span");
		d.style.cssText = "font: " + ctx.font + "; height: 1em; display: block; white-space: nowrap; overflow: show";
		d.appendChild(document.createTextNode(vars.text));
		document.body.appendChild(d);
		var metrics = ctx.measureText(vars.text);
		metrics.height = d.offsetHeight;
		console.log(metrics);
		document.body.removeChild(d);
		ctx.fillText(
			vars.text,
			(canvas.width - metrics.width) / 2,
			canvas.height / 2 + metrics.height / 2
		);
		*/

		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(
			vars.text,
			canvas.width / 2,
			canvas.height / 2,
			canvas.width
		);
	}

	$scope.generatePrint = function () {
		history.replaceState($scope.variables, "", location.params($scope.variables).href);

		partImageForPrinting(canvas).then(function (pdf) {
			$scope.progress = 100;

			var data = pdf.output();
			var buffer = new ArrayBuffer(data.length);
			var array = new Uint8Array(buffer);

			for (var i = 0; i < data.length; i++) {
				array[i] = data.charCodeAt(i);
			}

			var blob = new Blob(
				[ array ],
				{type: 'application/pdf', encoding: 'raw'}
			);

			var uri = window.URL.createObjectURL(blob);
			$scope.download = uri;
			$scope.filename = 'dekai.pdf';
			// document.getElementById('iframe').src = uri;

			$timeout(function () {
				$scope.progress = 0;
			}, 1000);
		}, function () {
		}, function (progress) {
			$scope.progress = Math.round(progress[0] / progress[1] * 100);
		});
	};

	function partImageForPrinting (canvas) {
		var ret = $q.defer();

		var converter = new UnitConverter({ dpi : 150 });
		converter.context(function ($q, canvas, ret) {
			var pdf = new jsPDF('portrait', 'mm', 'a4');
			(function () {
				// マージンをとりつつA4で分割をかける
				var a4 = document.createElement('canvas');
				var ctx = a4.getContext('2d');
				var margin = '20 mm';
				a4.setAttribute('width', '210 mm');
				a4.setAttribute('height', '297 mm');
				var pageWidth = a4.width - margin * 2;
				var pageHeight = a4.height - margin * 2;
				var maxX = Math.ceil(canvas.width  / pageWidth);
				var maxY = Math.ceil(canvas.height / pageHeight);

				var markerHeight = '1 cm';
				var markerWidth = maxX * '4 mm';

				var defer = $q.when();

				for (var y = 0; y < maxY; y++) { for (var x = 0; x < maxX; x++) { (function (x, y) {
					defer = defer.then(function () {
						// console.log([x, y]);
						ret.notify([y * maxX + x, maxY * maxX]);
						var isFirstPage = x === 0 && y === 0;
						if (!isFirstPage) {
							pdf.addPage();
						}
						ctx.save();
						ctx.fillStyle = "#ffffff";
						ctx.fillRect(0, 0, '210 mm', '297 mm');

						ctx.beginPath();
						ctx.moveTo(margin, margin);
						ctx.lineTo(margin, '297 mm' - margin);
						ctx.lineTo('210 mm' - margin, '297 mm' - margin);
						ctx.lineTo('210 mm' - margin, margin);
						ctx.lineTo(margin, margin);
						ctx.stroke();
						ctx.restore();

						ctx.drawImage(
							canvas,
							x * pageWidth,
							y * pageHeight,
							a4.width - margin * 2,
							a4.height - margin * 2,
							margin,
							margin,
							a4.width - margin * 2,
							a4.height - margin * 2
						);

						ctx.strokeStyle = "#000000";
						ctx.lineWidth = '0.3 pt';

						ctx.save();
						ctx.translate('20 mm', '5 mm');
						ctx.strokeRect(0, 0, markerWidth, markerHeight);
						ctx.beginPath();
						for (var yy = 0; yy < maxY; yy++) {
							ctx.moveTo(0, yy * (markerHeight / maxY));
							ctx.lineTo(markerWidth, yy * (markerHeight / maxY));
						}
						for (var xx = 0; xx < maxX; xx++) {
							ctx.moveTo(xx * (markerWidth / maxX), 0);
							ctx.lineTo(xx * (markerWidth / maxX), markerHeight);
						}
						ctx.stroke();
						ctx.fillStyle = "#666666";
						ctx.fillRect(x * (markerWidth / maxX), y * (markerHeight / maxY), (markerWidth / maxX), (markerHeight / maxY));
						ctx.restore();

						// PNG makes browser crash
						pdf.addImage(a4, 'JPEG', 0, 0, 210, 297);

						var d = $q.defer();
						setTimeout(function () {
							d.resolve();
						}, 0);
						return d.promise;
					});
				})(x, y); } }

				defer.then(function () {
					ret.resolve(pdf);
				});
			})();
		}, $q, canvas, ret);
		return ret.promise;
	}

});
