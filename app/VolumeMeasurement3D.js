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
  "esri/views/SceneView",
  "esri/geometry/Point",
  "esri/geometry/Multipoint",
  "esri/geometry/Extent",
  "esri/geometry/Polyline",
  "esri/geometry/Polygon",
  "esri/geometry/geometryEngine",
  "esri/Graphic",
  "esri/layers/GraphicsLayer",
  "esri/layers/FeatureLayer",
  "esri/layers/ElevationLayer",
  "esri/widgets/Sketch/SketchViewModel"
], function(on, number, Color, colors,
            Accessor, Evented, SceneView,
            Point, Multipoint, Extent, Polyline, Polygon, geometryEngine,
            Graphic, GraphicsLayer, FeatureLayer, ElevationLayer,
            SketchViewModel){


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
      _baselineLayer: {
        type: ElevationLayer
      },
      _compareLayer: {
        type: ElevationLayer
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
      _toggleNode.classList.add("icon-ui-up", "text-off-black", "esri-interactive", "text-rule");
      _toggleNode.innerText = "Options";
      this.container.append(_toggleNode);

      on(_toggleNode, "click", () => {
        _toggleNode.classList.toggle("icon-ui-up");
        _toggleNode.classList.toggle("icon-ui-down");
        _toggleNode.classList.toggle("text-rule");
        _optionsPanel.classList.toggle("hide");
      });

      const _optionsPanel = document.createElement("div");
      _optionsPanel.classList.add("panel", "trailer-quarter", "hide");
      this.container.append(_optionsPanel);

      // BASELINE //
      const _baselineLayerLabel = document.createElement("div");
      _baselineLayerLabel.innerText = "Base Elevation Layer";
      _optionsPanel.append(_baselineLayerLabel);

      this._baselineLayerSelect = document.createElement("select");
      this._baselineLayerSelect.classList.add("select-full");
      _optionsPanel.append(this._baselineLayerSelect);

      // COMPARE //
      const _compareLayerLabel = document.createElement("div");
      _compareLayerLabel.classList.add("leader-quarter");
      _compareLayerLabel.innerText = "Compare Elevation Layer";
      _optionsPanel.append(_compareLayerLabel);

      this._compareLayerSelect = document.createElement("select");
      this._compareLayerSelect.classList.add("select-full");
      _optionsPanel.append(this._compareLayerSelect);

      // SAMPLING DISTANCE //
      const _samplingDistanceLabel = document.createElement("div");
      _samplingDistanceLabel.classList.add("leader-half");
      _samplingDistanceLabel.innerText = `Sampling Distance: ${this.dem_resolution} meters`;
      _optionsPanel.append(_samplingDistanceLabel);

      const _samplingDistanceInput = document.createElement("input");
      _samplingDistanceInput.setAttribute("type", "range");
      _samplingDistanceInput.setAttribute("min", "0.5");
      _samplingDistanceInput.setAttribute("max", "10.0");
      _samplingDistanceInput.setAttribute("step", "0.5");
      _samplingDistanceInput.setAttribute("value", this.dem_resolution);
      _optionsPanel.append(_samplingDistanceInput);
      on(_samplingDistanceInput, "input", () => {
        this.dem_resolution = _samplingDistanceInput.valueAsNumber;
        _samplingDistanceLabel.innerText = `Sampling Distance: ${this.dem_resolution.toFixed(1)} meters`;
      });

      // MESH LAYERS //
      const _meshesLayerLabel = document.createElement("label");
      _meshesLayerLabel.setAttribute("for", "volume-layer-input");
      _meshesLayerLabel.classList.add("leader-half", "trailer-0");
      _meshesLayerLabel.innerHTML = "Display Elevation Meshes";
      _optionsPanel.append(_meshesLayerLabel);

      this._meshLayersInput = document.createElement("input");
      this._meshLayersInput.classList.add("trailer-0");
      this._meshLayersInput.setAttribute("id", "volume-layer-input");
      this._meshLayersInput.setAttribute("type", "checkbox");
      _meshesLayerLabel.append(this._meshLayersInput);

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

      // INITIALIZE LAYER LIST //
      this._initializeLayerList();

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

      const baselineSymbol = { type: "simple-line", color: Color.named.dodgerblue };
      this._meshBaselineLayer = new GraphicsLayer({
        title: "Baseline Mesh Layer",
        elevationInfo: { mode: "absolute-height" },
        visible: this.meshLayersDefaultVisible
      });

      const compareSymbol = { type: "simple-line", color: Color.named.orange };
      this._meshCompareLayer = new GraphicsLayer({
        title: "Compare Mesh Layer",
        elevationInfo: { mode: "absolute-height", offset: 0.05 },
        visible: this.meshLayersDefaultVisible
      });
      this.view.map.addMany([
        this._meshBaselineLayer,
        this._meshCompareLayer
      ]);

      this.clearMeshes = () => {
        this._meshBaselineLayer.removeAll();
        this._meshCompareLayer.removeAll();
      };

      this.addMeshes = (gridMeshInfos) => {
        this.clearMeshes();
        this._meshBaselineLayer.add(new Graphic({ geometry: gridMeshInfos.baseline, symbol: baselineSymbol }));
        this._meshCompareLayer.add(new Graphic({ geometry: gridMeshInfos.compare, symbol: compareSymbol }));
      };

    },

    /**
     *
     * @private
     */
    _initializeLayerList: function(){

      //
      // TODO: WHAT IF THERE ARE NO ELEVATION LAYERS IN THE GROUND? IS THAT EVEN POSSIBLE?
      //

      //
      this.elevationLayers.forEach((layer, layerIdx) => {

        const _baselineLayerOption = document.createElement("option");
        _baselineLayerOption.innerText = layer.title;
        _baselineLayerOption.value = layer.id;
        this._baselineLayerSelect.append(_baselineLayerOption);

        const _compareLayerOption = document.createElement("option");
        _compareLayerOption.innerText = layer.title;
        _compareLayerOption.value = layer.id;
        this._compareLayerSelect.append(_compareLayerOption);

      });
      // INITIAL SELECTION //
      this._baselineLayerSelect.selectedIndex = 0;
      this._compareLayerSelect.selectedIndex = (this.elevationLayers.length - 1);

      // FIND ELEVATION LAYER BY LAYER ID //
      const _findElevationLayer = (layerId) => {
        return this.elevationLayers.find(layer => {
          return (layer.id === layerId);
        });
      };

      on(this._baselineLayerSelect, "change", () => {
        this._baselineLayer = _findElevationLayer(this._baselineLayerSelect.value);
      });
      on(this._compareLayerSelect, "change", () => {
        this._compareLayer = _findElevationLayer(this._compareLayerSelect.value);
      });

      this._baselineLayer = _findElevationLayer(this._baselineLayerSelect.value);
      this._compareLayer = _findElevationLayer(this._compareLayerSelect.value);

    },

    /**
     *
     */
    initializeSketch: function(){

      // HIGHLIGHT //
      this.view.highlightOptions = {
        color: "#fff",
        haloOpacity: 0.8,
        fillOpacity: 0.0
      };

      // VOLUME CELLS LAYER //
      const sketchLayer = new GraphicsLayer({ title: "Sketch Layer" });
      this.view.map.add(sketchLayer);

      // SKETCH VIEW MODEL //
      const sketchVM = new SketchViewModel({
        view: this.view,
        layer: sketchLayer,
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

      let calc_mesh_handle = null;
      let calc_volume_handle = null;
      const _calculateVolume = (polygon) => {
        if(polygon.rings[0].length > 3){

          calc_volume_handle && (!calc_volume_handle.isFulfilled()) && calc_volume_handle.cancel();
          calc_volume_handle = this.calculateVolume(polygon, this.dem_resolution).then(volume_infos => {

            this._cutNode.innerText = number.format(volume_infos.cut, { places: 1 });
            this._fillNode.innerText = number.format(volume_infos.fill, { places: 1 });
            this._volumeNode.innerText = number.format(volume_infos.volume, { places: 1 });

          });

          calc_mesh_handle && (!calc_mesh_handle.isFulfilled()) && calc_mesh_handle.cancel();
          calc_mesh_handle = this.createMeshGeometry(polygon, this.dem_resolution).then(gridMeshInfos => {
            this.addMeshes(gridMeshInfos);
          });

        }
      };

      sketchVM.on("create", (evt) => {
        switch(evt.state){
          case "start":
            this.emit("measurement-started", {});
            break;
          case "complete":
            _calculateVolume(evt.graphic.geometry);
            break;
        }
      });

      sketchVM.on("update", (evt) => {
        switch(evt.state){
          case "start":
            this._clearMeasurementValues();
            break;
          case "complete":
            _calculateVolume(evt.graphics[0].geometry);
            break;
        }
      });

      this.createVolumeSketch = () => {
        sketchVM.create("polygon");
        this.view.focus();
      };

      this.clearVolumeSketch = () => {
        sketchLayer.removeAll();
        sketchVM.cancel();
      };

    },

    /**
     * 
     * @private
     */
    _clearMeasurementValues: function(){

      this.clearMeshes();
      this._cutNode.innerText = "0.0";
      this._fillNode.innerText = "0.0";
      this._volumeNode.innerText = "0.0";

    },

    /**
     *
     */
    clearMeasurement: function(){

      this.clearMeshes();
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

      this.clearMeshes();
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

      const sample_infos = {
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
            let sample_area = Polygon.fromExtent(extent);
            if(geometryEngine.crosses(sample_area, boundary)){
              const cut_geometries = geometryEngine.cut(sample_area, boundary);
              if(cut_geometries.length){
                sample_area = cut_geometries[1];
              }
            }
            if(sample_area){
              sample_infos.areas.push(sample_area);
              sample_infos.centers.addPoint(sample_area.centroid);
            }
          }
        }
      }

      return sample_infos;
    },

    /**
     *
     * @param polygon
     * @param demResolution
     */
    createMeshGeometry: function(polygon, demResolution){

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

      const queryOptions = { demResolution: demResolution };
      return this._baselineLayer.queryElevation(clippedGridMeshLines, queryOptions).then(baselineResult => {
        return this._compareLayer.queryElevation(clippedGridMeshLines, queryOptions).then(compareResult => {
          return { baseline: baselineResult.geometry, compare: compareResult.geometry };
        });
      });

    },

    /**
     *
     * @param sample_points
     * @param demResolution
     * @returns {Promise}
     * @private
     */
    _getElevations: function(sample_points, demResolution){
      const query_options = { demResolution: demResolution };
      return this._baselineLayer.queryElevation(sample_points, query_options).then(baselineResult => {
        return this._compareLayer.queryElevation(sample_points, query_options).then(compareResult => {
          return { baseline_points: baselineResult.geometry.points, compare_points: compareResult.geometry.points };
        });
      });
    },

    /**
     *
     * @param polygon
     * @param dem_resolution
     * @returns {Promise}
     */
    calculateVolume: function(polygon, dem_resolution){

      const sample_infos = this._getSampleInfos(polygon, dem_resolution);

      return this._getElevations(sample_infos.centers, dem_resolution).then(elevation_infos => {
        const baseline_points = elevation_infos.baseline_points;
        const compare_points = elevation_infos.compare_points;
        return compare_points.reduce((infos, coord, coordIdx) => {

          const sample_area = sample_infos.areas[coordIdx];
          const area_m2 = geometryEngine.planarArea(sample_area, "square-meters");

          const baseline_z = baseline_points[coordIdx][2];
          const compare_z = coord[2];
          const height_diff = (compare_z - baseline_z);
          const volume = (height_diff * area_m2);

          infos.volume += volume;
          if(volume < 0){
            infos.cut += volume;
          } else {
            infos.fill += volume;
          }

          return infos;
        }, { cut: 0.0, fill: 0.0, volumes: [], volume: 0.0 });

      });

    }

  });

  VolumeMeasurement3D.version = "0.0.1";

  return VolumeMeasurement3D;
});
