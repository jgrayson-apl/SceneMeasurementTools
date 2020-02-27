/**
 *
 * VolumeMeasurement3D
 *  - Calculate volume measurements in 3D
 *
 * Author:   John Grayson - Applications Prototype Lab - Esri
 * Created:  3/27/2019 - 0.0.1 -
 * Modified:
 *
 */
define([
  "dojo/on",
  "dojo/number",
  "dojo/_base/Color",
  "dojo/colors",
  "esri/core/Accessor",
  "esri/core/Evented",
  "esri/core/promiseUtils",
  "esri/views/SceneView",
  "esri/geometry/Point",
  "esri/geometry/Multipoint",
  "esri/geometry/Extent",
  "esri/geometry/Polyline",
  "esri/geometry/Polygon",
  "esri/geometry/geometryEngine",
  "esri/Graphic",
  "esri/layers/GraphicsLayer",
  "esri/layers/ElevationLayer",
  "esri/widgets/Sketch/SketchViewModel"
], function(on, number, Color, colors,
            Accessor, Evented, promiseUtils,
            SceneView, Point, Multipoint, Extent, Polyline, Polygon, geometryEngine,
            Graphic, GraphicsLayer, ElevationLayer, SketchViewModel){


  const ElevationPlane = Accessor.createSubclass([Evented], {
    declaredClass: "ElevationPlane",

    properties: {
      elevation: {
        type: Number
      }
    },

    /**
     *
     * @param geometries
     * @param options
     * @returns {Promise}
     */
    queryElevation: function(geometries, options){
      return promiseUtils.create((resolve, reject) => {
        let geometriesWithZ;
        if(Array.isArray(geometries)){
          geometriesWithZ = geometries.map(geometry => {
            return this._setGeometryZ(geometry, this.elevation, options);
          });
        } else {
          geometriesWithZ = this._setGeometryZ(geometries, this.elevation, options);
        }
        resolve({ geometry: geometriesWithZ });
      });
    },

    /**
     *
     * @param geometry
     * @param newZ
     * @param options
     * @returns {*}
     * @private
     */
    _setGeometryZ: function(geometry, newZ, options){
      switch(geometry.type){
        case "point":
          return this._setPointZ(geometry, newZ);
        case "extent":
          return this._setExtentZ(geometry, newZ);
        case "multipoint":
          return new Multipoint({
            spatialReference: geometry.spatialReference,
            hasM: geometry.hasM, hasZ: true,
            points: this._setPartZ(geometry.points, newZ, geometry.hasM)
          });
        case "polyline":
          if(options && options.demResolution){
            geometry = geometryEngine.geodesicDensify(geometry, options.demResolution, "meters");
          }
          return new Polyline({
            spatialReference: geometry.spatialReference,
            hasM: geometry.hasM, hasZ: true,
            paths: this._setPartsZ(geometry.paths, newZ, geometry.hasM)
          });
        case "polygon":
          if(options && options.demResolution){
            geometry = geometryEngine.geodesicDensify(geometry, options.demResolution, "meters");
          }
          return new Polygon({
            spatialReference: geometry.spatialReference,
            hasM: geometry.hasM, hasZ: true,
            rings: this._setPartsZ(geometry.rings, newZ, geometry.hasM)
          });
      }
    },

    /**
     *
     * @param point
     * @param newZ
     * @returns {*}
     * @private
     */
    _setPointZ: function(point, newZ){
      point.hasZ = true;
      point.z = newZ;
      return point;
    },

    /**
     *
     * @param extent
     * @param newZ
     * @returns {*}
     * @private
     */
    _setExtentZ: function(extent, newZ){
      extent.hasZ = true;
      extent.zmin = newZ;
      extent.zmax = newZ;
      return extent;
    },

    /**
     *
     * @param parts
     * @param newZ
     * @param hasM
     * @returns {*}
     * @private
     */
    _setPartsZ: function(parts, newZ, hasM){
      return parts.map(part => {
        return this._setPartZ(part, newZ, hasM);
      })
    },

    /**
     *
     * @param part
     * @param newZ
     * @param hasM
     * @returns {*}
     * @private
     */
    _setPartZ: function(part, newZ, hasM){
      return part.map(coords => {
        return hasM ? [coords[0], coords[1], coords[2], newZ] : [coords[0], coords[1], newZ];
      });
    }

  });


  const VolumeMeasurement3D = Accessor.createSubclass([Evented], {
    declaredClass: "VolumeMeasurement3D",

    properties: {
      container: {
        type: HTMLElement | String,
        set: function(value){
          this._set("container", (value instanceof HTMLElement) ? value : document.getElementById(value));
          this._initializeUI();
        }
      },
      view: {
        type: SceneView,
        dependsOn: ["container"],
        set: function(value){
          this._set("view", value);
          this._initialize();
        }
      },
      elevationLayers: {
        aliasOf: "view.map.ground.layers"
      },
      _baselineSource: {
        type: ElevationLayer | ElevationPlane
      },
      _compareSource: {
        type: ElevationLayer | ElevationPlane
      },
      _meshBaselineLayer: {
        type: GraphicsLayer
      },
      _meshCompareLayer: {
        type: GraphicsLayer
      },
      meshLayersDefaultVisible: {
        type: Boolean,
        value: true
      },
      dem_resolution: {
        type: Number,
        value: 3.0
      }
    },

    /**
     *
     * @private
     */
    _initializeUI: function(){

      this.container.classList.add("text-off-black");

      const _toggleNode = document.createElement("div");
      _toggleNode.classList.add("icon-ui-right", "text-off-black", "esri-interactive", "text-rule");
      _toggleNode.innerText = "Volume Options";
      this.container.append(_toggleNode);

      on(_toggleNode, "click", () => {
        _toggleNode.classList.toggle("icon-ui-right");
        _toggleNode.classList.toggle("icon-ui-down");
        _toggleNode.classList.toggle("text-rule");
        _optionsPanel.classList.toggle("hide");
      });

      const _optionsPanel = document.createElement("div");
      _optionsPanel.classList.add("panel", "trailer-quarter", "hide");
      this.container.append(_optionsPanel);

      // BASELINE //
      const _baselineLayerLabel = document.createElement("div");
      _baselineLayerLabel.innerText = "Base Elevation Source";
      _baselineLayerLabel.classList.add("text-dodgerblue");
      _optionsPanel.append(_baselineLayerLabel);

      this._baselineLayerSelect = document.createElement("select");
      this._baselineLayerSelect.classList.add("select-full");
      _optionsPanel.append(this._baselineLayerSelect);

      // COMPARE //
      const _compareLayerLabel = document.createElement("div");
      _compareLayerLabel.classList.add("leader-quarter", "text-orange");
      _compareLayerLabel.innerText = "Compare Elevation Source";
      _optionsPanel.append(_compareLayerLabel);

      this._compareLayerSelect = document.createElement("select");
      this._compareLayerSelect.classList.add("select-full");
      _optionsPanel.append(this._compareLayerSelect);

      const _addPlaneLabel = document.createElement("div");
      _addPlaneLabel.innerHTML = "add elevation plane";
      _addPlaneLabel.classList.add("leader-quarter", "esri-interactive", "icon-ui-right");
      _optionsPanel.append(_addPlaneLabel);
      on(_addPlaneLabel, "click", () => {
        _addPlaneLabel.classList.toggle("icon-ui-right");
        _addPlaneLabel.classList.toggle("icon-ui-down");
        _addPlanePanel.classList.toggle("hide");
      });

      const _addPlanePanel = document.createElement("div");
      _addPlanePanel.classList.add("panel", "panel-white", "panel-no-padding", "margin-left-1", "hide");
      _optionsPanel.append(_addPlanePanel);

      const _addPlaneInputGroup = document.createElement("div");
      _addPlaneInputGroup.classList.add("input-group");
      _addPlanePanel.append(_addPlaneInputGroup);

      const _addPlaneElevationInput = document.createElement("input");
      _addPlaneElevationInput.classList.add("input-group-input");
      _addPlaneElevationInput.setAttribute("type", "number");
      _addPlaneElevationInput.setAttribute("placeholder", "elevation in meters");
      _addPlaneElevationInput.setAttribute("required", "true");
      _addPlaneInputGroup.append(_addPlaneElevationInput);

      const validateElevationInput = () => {
        _addPlaneElevationInput.classList.toggle("input-success", _addPlaneElevationInput.validity.valid);
        _addPlaneElevationInput.classList.toggle("input-error", !_addPlaneElevationInput.validity.valid);
        _addPlaneBtn.classList.toggle("btn-disabled", !_addPlaneElevationInput.validity.valid);
      };
      on(_addPlaneElevationInput, "input", validateElevationInput);

      const _addPlaneInputGroupButton = document.createElement("span");
      _addPlaneInputGroupButton.classList.add("input-group-button");
      _addPlaneInputGroup.append(_addPlaneInputGroupButton);

      const _addPlaneBtn = document.createElement("button");
      _addPlaneBtn.classList.add("btn", "btn-small", "btn-clear", "btn-disabled");
      _addPlaneBtn.innerHTML = "add";
      _addPlaneInputGroupButton.append(_addPlaneBtn);
      on(_addPlaneBtn, "click", () => {
        if(_addPlaneElevationInput.validity.valid){
          this.addElevationPlane(_addPlaneElevationInput.valueAsNumber);
          _addPlaneElevationInput.value = null;
          validateElevationInput();
        }
      });
      validateElevationInput();

      // SAMPLING DISTANCE //
      const _samplingDistanceLabel = document.createElement("div");
      _samplingDistanceLabel.classList.add("leader-half");
      _samplingDistanceLabel.innerText = `Sampling Distance: ${this.dem_resolution} meters`;
      _optionsPanel.append(_samplingDistanceLabel);

      const _samplingDistanceInput = document.createElement("input");
      _samplingDistanceInput.setAttribute("type", "range");
      _samplingDistanceInput.setAttribute("min", "1.0");
      _samplingDistanceInput.setAttribute("max", "30.0");
      _samplingDistanceInput.setAttribute("step", "1.0");
      _samplingDistanceInput.setAttribute("value", this.dem_resolution);
      _optionsPanel.append(_samplingDistanceInput);
      on(_samplingDistanceInput, "input", () => {
        this.dem_resolution = _samplingDistanceInput.valueAsNumber;
        _samplingDistanceLabel.innerText = `Sampling Distance: ${this.dem_resolution.toFixed(1)} meters`;
      });
      on(_samplingDistanceInput, "change", () => {
        this._recalculateVolume();
      });

      // MESH LAYERS //
      const _meshesLayerToggle = document.createElement("label");
      _meshesLayerToggle.innerHTML = "Display Elevation Meshes";
      _meshesLayerToggle.setAttribute("for", "volume-layer-input");
      _meshesLayerToggle.classList.add("leader-half", "trailer-0");
      _optionsPanel.append(_meshesLayerToggle);

      this._meshLayersInput = document.createElement("input");
      this._meshLayersInput.classList.add("trailer-0");
      this._meshLayersInput.setAttribute("id", "volume-layer-input");
      this._meshLayersInput.setAttribute("type", "checkbox");
      _meshesLayerToggle.append(this._meshLayersInput);

      this._meshLayersInput.checked = this.meshLayersDefaultVisible;

      on(this._meshLayersInput, "change", () => {
        if(this._meshBaselineLayer){
          this._meshBaselineLayer.visible = this._meshLayersInput.checked;
        }
        if(this._meshCompareLayer){
          this._meshCompareLayer.visible = this._meshLayersInput.checked;
        }
      });

      // HINT NODE //
      this._hintNode = document.createElement("div");
      this._hintNode.classList.add("panel", "panel-white", "panel-no-border", "hide");
      this._hintNode.innerText = "Start to measure by clicking in the scene to place your first point";
      this.container.append(this._hintNode);

      // CONTENT NODE //
      this._contentNode = document.createElement("div");
      this._contentNode.classList.add("hide");
      this.container.append(this._contentNode);

      const _panelNode = document.createElement("div");
      _panelNode.classList.add("panel", "leader-quarter", "trailer-quarter");
      this._contentNode.append(_panelNode);

      //
      // CUT //
      //
      const cutLabelNode = document.createElement("div");
      cutLabelNode.innerText = "Cut";
      _panelNode.append(cutLabelNode);

      const cutParentNode = document.createElement("div");
      cutParentNode.classList.add("avenir-demi");
      _panelNode.append(cutParentNode);

      this._cutNode = document.createElement("span");
      this._cutNode.innerText = "0.0";
      cutParentNode.append(this._cutNode);

      const cutUnitNode = document.createElement("span");
      cutUnitNode.innerHTML = "&nbsp;m<sup>3</sup>";
      cutParentNode.append(cutUnitNode);

      //
      // FILL //
      //
      const fillLabelNode = document.createElement("div");
      fillLabelNode.innerText = "Fill";
      _panelNode.append(fillLabelNode);

      const fillParentNode = document.createElement("div");
      fillParentNode.classList.add("avenir-demi");
      _panelNode.append(fillParentNode);

      this._fillNode = document.createElement("span");
      this._fillNode.innerText = "0.0";
      fillParentNode.append(this._fillNode);

      const fillUnitNode = document.createElement("span");
      fillUnitNode.innerHTML = "&nbsp;m<sup>3</sup>";
      fillParentNode.append(fillUnitNode);

      //
      // VOLUME //
      //
      const volumeLabelNode = document.createElement("div");
      volumeLabelNode.innerText = "Volume Change";
      _panelNode.append(volumeLabelNode);

      const volumeParentNode = document.createElement("div");
      volumeParentNode.classList.add("avenir-demi");
      _panelNode.append(volumeParentNode);

      this._volumeNode = document.createElement("span");
      this._volumeNode.innerText = "0.0";
      volumeParentNode.append(this._volumeNode);

      const volumeUnitNode = document.createElement("span");
      volumeUnitNode.innerHTML = "&nbsp;m<sup>3</sup>";
      volumeParentNode.append(volumeUnitNode);

      //
      // NEW MEASUREMENT //
      //
      this._newMeasurementNode = document.createElement("div");
      this._newMeasurementNode.classList.add("leader-half");
      this.container.append(this._newMeasurementNode);

      const _newMeasurementBtn = document.createElement("button");
      _newMeasurementBtn.classList.add("btn", "btn-clear", "btn-fill");
      _newMeasurementBtn.innerHTML = "New Measurement";
      this._newMeasurementNode.append(_newMeasurementBtn);
      on(_newMeasurementBtn, "click", this.newMeasurement.bind(this));

    },

    /**
     *
     * @private
     */
    _initialize: function(){

      // ELEVATION SOURCES //
      this._initializeElevationSourceList();

      // MESH LAYERS //
      this._initializeMeshLayers();

      // INITIALIZE SKETCH //
      this.initializeSketch();

    },

    /**
     *
     * @private
     */
    _initializeMeshLayers: function(){

      // 5 CM //
      const meshVisualizationOffset = 0.05;

      const baselineSymbol = { type: "simple-line", color: Color.named.dodgerblue };
      this._meshBaselineLayer = new GraphicsLayer({
        title: "Baseline Mesh Layer",
        elevationInfo: { mode: "absolute-height", offset: meshVisualizationOffset },
        visible: this.meshLayersDefaultVisible
      });

      const compareSymbol = { type: "simple-line", color: Color.named.orange };
      this._meshCompareLayer = new GraphicsLayer({
        title: "Compare Mesh Layer",
        elevationInfo: { mode: "absolute-height", offset: meshVisualizationOffset },
        visible: this.meshLayersDefaultVisible
      });
      this.view.map.addMany([
        this._meshBaselineLayer,
        this._meshCompareLayer
      ]);

      this._clearMeshes = () => {
        this._meshBaselineLayer.removeAll();
        this._meshCompareLayer.removeAll();
      };

      this._addMeshes = (gridMeshInfos) => {
        this._clearMeshes();
        this._meshBaselineLayer.add(new Graphic({ geometry: gridMeshInfos.baseline, symbol: baselineSymbol }));
        this._meshCompareLayer.add(new Graphic({ geometry: gridMeshInfos.compare, symbol: compareSymbol }));
      };

    },

    /**
     *
     * @private
     */
    _initializeElevationSourceList: function(){

      // FIND ELEVATION SOURCE //
      const _findElevationSource = (sourceInfo) => {
        const sourceParts = sourceInfo.split("-");
        const sourceType = sourceParts[1];
        const layerID_or_elevation = sourceParts[2];

        switch(sourceType){
          case "layer":
            return this.elevationLayers.find(layer => {
              return (layer.id === layerID_or_elevation);
            });
          case "plane":
            return new ElevationPlane({ elevation: Number(layerID_or_elevation) });
          default:
            return null;
        }
      };

      //
      // TODO: WHAT IF THERE ARE NO ELEVATION LAYERS IN THE GROUND? IS THAT EVEN POSSIBLE?
      //

      /**
       *
       * @param elevation
       */
      this.addElevationPlane = (elevation) => {

        const _baselineLayerOption = document.createElement("option");
        _baselineLayerOption.innerText = `Plane at ${elevation} meters`;
        _baselineLayerOption.value = `source-plane-${elevation}`;
        this._baselineLayerSelect.append(_baselineLayerOption);

        const _compareLayerOption = document.createElement("option");
        _compareLayerOption.innerText = `Plane at ${elevation} meters`;
        _compareLayerOption.value = `source-plane-${elevation}`;
        this._compareLayerSelect.append(_compareLayerOption);

      };

      // ELEVATION LAYERS //
      this.elevationLayers.forEach((layer, layerIdx) => {

        const _baselineLayerOption = document.createElement("option");
        _baselineLayerOption.innerText = layer.title;
        _baselineLayerOption.value = `source-layer-${layer.id}`;
        this._baselineLayerSelect.append(_baselineLayerOption);

        const _compareLayerOption = document.createElement("option");
        _compareLayerOption.innerText = layer.title;
        _compareLayerOption.value = `source-layer-${layer.id}`;
        this._compareLayerSelect.append(_compareLayerOption);

      });

      // INITIAL SELECTION //
      this._baselineLayerSelect.selectedIndex = 0;
      this._compareLayerSelect.selectedIndex = (this.elevationLayers.length - 1);

      // INITIAL ELEVATION SOURCES //
      this._baselineSource = _findElevationSource(this._baselineLayerSelect.value);
      this._compareSource = _findElevationSource(this._compareLayerSelect.value);

      // ELEVATION SOURCES CHANGE //
      on(this._baselineLayerSelect, "change", () => {
        this._baselineSource = _findElevationSource(this._baselineLayerSelect.value);
        this._recalculateVolume();
      });
      on(this._compareLayerSelect, "change", () => {
        this._compareSource = _findElevationSource(this._compareLayerSelect.value);
        this._recalculateVolume();
      });

    },

    /**
     *
     */
    initializeSketch: function(){

      // HIGHLIGHT //
      this.view.highlightOptions = {
        color: "#ffffff",
        haloOpacity: 0.3,
        fillOpacity: 0.0
      };

      // VOLUME CELLS LAYER //
      const sketchLayer = new GraphicsLayer({ title: "Sketch Layer" });
      this.view.map.add(sketchLayer);

      // SKETCH VIEW MODEL //
      const sketchVM = new SketchViewModel({
        view: this.view,
        layer: sketchLayer,
        defaultUpdateOptions: { tool: "reshape" },
        polylineSymbol: {
          type: "line-3d",
          material: { color: [255, 255, 255, 1.0] },
          size: 1.2
        },
        polygonSymbol: {
          type: "polygon-3d",
          symbolLayers: [
            {
              type: "fill",
              material: { color: [232, 145, 46, 0.4] },
              outline: { color: [255, 255, 255, 1.0], size: 1.2 }
            }
          ]
        }
      });

      let _sketchPolygon = null;

      let calc_mesh_handle = null;
      let calc_volume_handle = null;
      const __calculateVolume = () => {
        if(_sketchPolygon && _sketchPolygon.rings[0].length > 3){

          calc_volume_handle && (!calc_volume_handle.isFulfilled()) && calc_volume_handle.cancel();
          calc_volume_handle = this._calculateVolume(_sketchPolygon, this.dem_resolution).then(volume_infos => {

            this._cutNode.innerText = number.format(volume_infos.cut, { places: 1 });
            this._fillNode.innerText = number.format(volume_infos.fill, { places: 1 });
            this._volumeNode.innerText = number.format(volume_infos.volume, { places: 1 });

          });

          calc_mesh_handle && (!calc_mesh_handle.isFulfilled()) && calc_mesh_handle.cancel();
          calc_mesh_handle = this._createMeshGeometry(_sketchPolygon, this.dem_resolution).then(gridMeshInfos => {
            this._addMeshes(gridMeshInfos);
          });

        }
      };

      // CREATE //
      sketchVM.on("create", (evt) => {
        switch(evt.state){
          case "start":
            _sketchPolygon = null;
            this.emit("measurement-started", {});
            break;
          case "complete":
            _sketchPolygon = evt.graphic.geometry;
            __calculateVolume();
            break;
        }
      });

      // UPDATE //
      sketchVM.on("update", (evt) => {
        switch(evt.state){
          case "start":
            this._clearMeasurementValues();
            break;
          case "cancel":
          case "complete":
            _sketchPolygon = evt.graphics[0].geometry;
            __calculateVolume();
            break;
        }
      });

      this.createVolumeSketch = () => {
        _sketchPolygon = null;
        sketchVM.create("polygon");
        this.view.focus();
      };

      this.clearVolumeSketch = () => {
        _sketchPolygon = null;
        sketchLayer.removeAll();
        sketchVM.cancel();
      };

      this._recalculateVolume = () => {
        __calculateVolume();
      }

    },

    /**
     *
     * @private
     */
    _clearMeasurementValues: function(){

      this._clearMeshes();
      this._cutNode.innerText = "0.0";
      this._fillNode.innerText = "0.0";
      this._volumeNode.innerText = "0.0";

    },

    /**
     *
     */
    clearMeasurement: function(){

      this._clearMeshes();
      this.clearVolumeSketch();
      this._newMeasurementNode.classList.remove("hide");
      this._hintNode.classList.add("hide");
      this._contentNode.classList.add("hide");
      this._cutNode.innerText = "0.0";
      this._fillNode.innerText = "0.0";
      this._volumeNode.innerText = "0.0";

    },

    /**
     *
     */
    newMeasurement: function(){

      this._clearMeshes();
      this.clearVolumeSketch();
      this._newMeasurementNode.classList.add("hide");
      this._contentNode.classList.add("hide");
      this._hintNode.classList.remove("hide");

      this.on("measurement-started", () => {
        this._hintNode.classList.add("hide");
        this._newMeasurementNode.classList.remove("hide");
        this._contentNode.classList.remove("hide");
      });

      this.createVolumeSketch();
    },

    /**
     *
     * @param polygon
     * @returns {*}
     * @private
     */
    _polygonToPolyline: function(polygon){
      return new Polyline({
        spatialReference: polygon.spatialReference,
        hasM: polygon.hasM, hasZ: polygon.hasZ,
        paths: polygon.rings
      });
    },

    /**
     *
     * @param polygon
     * @param resolution
     * @returns {{areas: Array, centers: Array}}
     * @private
     */
    _getSampleInfos: function(polygon, resolution){

      const boundary = this._polygonToPolyline(polygon);

      const sampleInfos = {
        centers: new Multipoint({ spatialReference: polygon.spatialReference, points: [] }),
        areas: []
      };

      const extent = polygon.extent;
      for(let y_coord = extent.ymin; y_coord < extent.ymax; y_coord += resolution){
        for(let x_coord = extent.xmin; x_coord < extent.xmax; x_coord += resolution){

          const extent = new Extent({
            spatialReference: polygon.spatialReference,
            xmin: x_coord, xmax: (x_coord + resolution),
            ymin: y_coord, ymax: (y_coord + resolution)
          });

          if(extent.intersects(polygon)){
            let sampleArea = Polygon.fromExtent(extent);
            if(geometryEngine.crosses(sampleArea, boundary)){
              const cutGeometries = geometryEngine.cut(sampleArea, boundary);
              if(cutGeometries.length){
                sampleArea = cutGeometries[1];
              }
            }
            if(sampleArea){
              sampleInfos.areas.push(sampleArea);
              sampleInfos.centers.addPoint(sampleArea.centroid);
            }
          }
        }
      }

      return sampleInfos;
    },

    /**
     *
     * @param polygon
     * @param demResolution
     */
    _createMeshGeometry: function(polygon, demResolution){

      const samplingDistance = (demResolution * 0.5);

      const boundary = this._polygonToPolyline(polygon);
      const gridMeshLines = new Polyline({ spatialReference: polygon.spatialReference, paths: boundary.paths });

      const extent = polygon.extent.clone().expand(1.1);
      for(let y_coord = extent.ymin; y_coord < extent.ymax; y_coord += samplingDistance){
        gridMeshLines.addPath([[extent.xmin, y_coord], [extent.xmax, y_coord]]);
      }
      for(let x_coord = extent.xmin; x_coord < extent.xmax; x_coord += samplingDistance){
        gridMeshLines.addPath([[x_coord, extent.ymin], [x_coord, extent.ymax]]);
      }

      let clippedGridMeshLines = geometryEngine.cut(gridMeshLines, boundary)[1];
      clippedGridMeshLines = geometryEngine.geodesicDensify(clippedGridMeshLines, samplingDistance, "meters");

      return this._interpolateShapeZ(clippedGridMeshLines, demResolution);
    },

    /**
     *
     * @param geometry
     * @param demResolution
     * @returns {Promise}
     * @private
     */
    _interpolateShapeZ: function(geometry, demResolution){
      const query_options = { demResolution: demResolution };
      return this._baselineSource.queryElevation(geometry, query_options).then(baselineResult => {
        return this._compareSource.queryElevation(geometry, query_options).then(compareResult => {
          return { baseline: baselineResult.geometry, compare: compareResult.geometry };
        });
      });
    },

    /**
     *
     * @param polygon
     * @param dem_resolution
     * @returns {Promise}
     */
    _calculateVolume: function(polygon, dem_resolution){

      const sampleInfos = this._getSampleInfos(polygon, dem_resolution);

      return this._interpolateShapeZ(sampleInfos.centers, dem_resolution).then(elevation_infos => {
        const baselinePoints = elevation_infos.baseline.points;
        const comparePoints = elevation_infos.compare.points;

        return comparePoints.reduce((infos, coords, coordsIdx) => {

          const sampleArea = sampleInfos.areas[coordsIdx];
          const area_m2 = geometryEngine.planarArea(sampleArea, "square-meters");

          const baselineZ = baselinePoints[coordsIdx][2];
          const compareZ = coords[2];
          const heightDiff = (compareZ - baselineZ);
          const volume = (heightDiff * area_m2);

          infos.volume += volume;
          if(volume < 0){
            infos.cut += volume;
          } else {
            infos.fill += volume;
          }

          return infos;
        }, { volume: 0.0, cut: 0.0, fill: 0.0 });

      });
    }

  });

  VolumeMeasurement3D.version = "0.0.1";

  return VolumeMeasurement3D;
});
