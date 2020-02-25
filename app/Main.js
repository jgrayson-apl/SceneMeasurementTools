/*
  Copyright 2017 Esri

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.​
*/

define([
  "calcite",
  "dojo/_base/declare",
  "ApplicationBase/ApplicationBase",
  "dojo/i18n!./nls/resources",
  "ApplicationBase/support/itemUtils",
  "ApplicationBase/support/domHelper",
  "dojo/_base/Color",
  "dojo/colors",
  "dojo/number",
  "dojo/date",
  "dojo/date/locale",
  "dojo/on",
  "dojo/query",
  "dojo/NodeList-dom",
  "dojo/dom",
  "dojo/dom-class",
  "dojo/dom-construct",
  "esri/identity/IdentityManager",
  "esri/core/Evented",
  "esri/core/watchUtils",
  "esri/core/promiseUtils",
  "esri/portal/Portal",
  "esri/layers/Layer",
  "esri/layers/ImageryLayer",
  "esri/layers/support/MosaicRule",
  "esri/geometry/Extent",
  "esri/Graphic",
  "esri/widgets/Feature",
  "esri/widgets/FeatureForm",
  "esri/widgets/Home",
  "esri/widgets/LayerList",
  "esri/widgets/Legend",
  "esri/widgets/Slice",
  "esri/widgets/Measurement",
  "Application/VolumeMeasurement3D",
  "esri/widgets/Expand"
], function(calcite, declare, ApplicationBase, i18n, itemUtils, domHelper,
            Color, colors, number, date, locale, on, query, domNodeList, dom, domClass, domConstruct,
            IdentityManager, Evented, watchUtils, promiseUtils, Portal,
            Layer, ImageryLayer, MosaicRule, Extent,
            Graphic, Feature, FeatureForm, Home, LayerList, Legend, Slice,
            Measurement, VolumeMeasurement3D, Expand){

  return declare([Evented], {

    /**
     *
     */
    constructor: function(){
      this.CSS = {
        loading: "configurable-application--loading"
      };
      this.base = null;

      // CALCITE WEB //
      calcite.init();
    },

    /**
     *
     * @param base
     */
    init: function(base){
      if(!base){
        console.error("ApplicationBase is not defined");
        return;
      }
      domHelper.setPageLocale(base.locale);
      domHelper.setPageDirection(base.direction);

      this.base = base;
      const config = base.config;
      const results = base.results;
      const find = config.find;
      const marker = config.marker;

      const allMapAndSceneItems = results.webMapItems.concat(results.webSceneItems);
      const validMapItems = allMapAndSceneItems.map(function(response){
        return response.value;
      });

      const firstItem = validMapItems[0];
      if(!firstItem){
        console.error("Could not load an item to display");
        return;
      }
      config.title = (config.title || itemUtils.getItemTitle(firstItem));
      domHelper.setPageTitle(config.title);

      const viewProperties = itemUtils.getConfigViewProperties(config);
      viewProperties.container = "view-container";
      viewProperties.constraints = { snapToZoom: false };

      const portalItem = this.base.results.applicationItem.value;
      const appProxies = (portalItem && portalItem.appProxies) ? portalItem.appProxies : null;

      itemUtils.createMapFromItem({ item: firstItem, appProxies: appProxies }).then((map) => {
        viewProperties.map = map;
        itemUtils.createView(viewProperties).then((view) => {
          itemUtils.findQuery(find, view).then(() => {
            itemUtils.goToMarker(marker, view).then(() => {
              this.viewReady(config, firstItem, view).then(() => {
                domClass.remove(document.body, this.CSS.loading);
              });
            });
          });
        });
      });
    },

    /**
     *
     * @param config
     * @param item
     * @param view
     */
    viewReady: function(config, item, view){

      // TITLE //
      dom.byId("app-title-node").innerHTML = config.title;

      // LOADING //
      const updating_node = domConstruct.create("div", { className: "view-loading-node loader" });
      domConstruct.create("div", { className: "loader-bars" }, updating_node);
      domConstruct.create("div", { className: "loader-text font-size--3 text-white", innerHTML: "Updating..." }, updating_node);
      view.ui.add(updating_node, "bottom-right");
      watchUtils.init(view, "updating", (updating) => {
        domClass.toggle(updating_node, "is-active", updating);
      });


      // USER SIGN IN //
      return this.initializeUserSignIn(view).always(() => {
        // HOME //
        const home = new Home({ view: view });
        view.ui.add(home, { position: "top-left", index: 0 });

        // APPLICATION READY //
        this.applicationReady(view);

      });

    },

    /**
     *
     * @returns {*}
     */
    initializeUserSignIn: function(view){

      const checkSignInStatus = () => {
        return IdentityManager.checkSignInStatus(this.base.portal.url).then(userSignIn);
      };
      IdentityManager.on("credential-create", checkSignInStatus);
      IdentityManager.on("credential-destroy", checkSignInStatus);

      // SIGN IN NODE //
      const signInNode = dom.byId("sign-in-node");
      const userNode = dom.byId("user-node");

      // UPDATE UI //
      const updateSignInUI = () => {
        if(this.base.portal.user){
          dom.byId("user-firstname-node").innerHTML = this.base.portal.user.fullName.split(" ")[0];
          dom.byId("user-fullname-node").innerHTML = this.base.portal.user.fullName;
          dom.byId("username-node").innerHTML = this.base.portal.user.username;
          dom.byId("user-thumb-node").src = this.base.portal.user.thumbnailUrl;
          domClass.add(signInNode, "hide");
          domClass.remove(userNode, "hide");
        } else {
          domClass.remove(signInNode, "hide");
          domClass.add(userNode, "hide");
        }
        return promiseUtils.resolve();
      };

      // SIGN IN //
      const userSignIn = () => {
        this.base.portal = new Portal({ url: this.base.config.portalUrl, authMode: "immediate" });
        return this.base.portal.load().then(() => {
          this.emit("portal-user-change", {});
          return updateSignInUI();
        }).otherwise(console.warn);
      };

      // SIGN OUT //
      const userSignOut = () => {
        IdentityManager.destroyCredentials();
        this.base.portal = new Portal({});
        this.base.portal.load().then(() => {
          this.base.portal.user = null;
          this.emit("portal-user-change", {});
          return updateSignInUI();
        }).otherwise(console.warn);

      };

      // USER SIGN IN //
      on(signInNode, "click", userSignIn);

      // SIGN OUT NODE //
      const signOutNode = dom.byId("sign-out-node");
      if(signOutNode){
        on(signOutNode, "click", userSignOut);
      }

      return checkSignInStatus();
    },

    /**
     *
     * @param view
     */
    initializePlaces: function(view){

      // WEB SCENE  //
      if(view.map.presentation && view.map.presentation.slides && (view.map.presentation.slides.length > 0)){

        // PLACES EXPAND //
        let placesExpand = null;

        // PLACES PANEL //
        let placesPanel = dom.byId("slides-container");
        if(!placesPanel){
          placesPanel = domConstruct.create("div", { className: "places-panel panel panel-no-padding esri-widget" });
          placesExpand = new Expand({
            view: view,
            content: placesPanel,
            expanded: true,
            expandIconClass: "esri-icon-applications",
            expandTooltip: "Places"
          }, domConstruct.create("div"));
          view.ui.add(placesExpand, "bottom-left");
        }

        // SLIDES //
        const slides = view.map.presentation.slides;
        slides.forEach(slide => {

          const slideNode = domConstruct.create("div", { className: "places-node esri-interactive", title: slide.title.text }, placesPanel);
          domConstruct.create("div", { className: "places-label", innerHTML: slide.title.text }, slideNode);
          domConstruct.create("img", { className: "places-thumb", src: slide.thumbnail.url }, slideNode);

          on(slideNode, "click", () => {
            slide.applyTo(view).then(() => {
              //placesExpand.collapse();
              console.info(view.map.ground.layers.map(l=>{return `${l.title} : ${l.visible}`}));
            });
          });
        });

        view.on("layerview-create", (evt) => {
          if(evt.layer.visible){
            slides.forEach((slide) => {
              slide.visibleLayers.add({ id: evt.layer.id });
            });
          }
        });
      }

    },


    /**
     * APPLICATION READY
     *
     * @param view
     */
    applicationReady: function(view){

      // PLACES //
      this.initializePlaces(view);

      // TILT //
      this.initializeTilt(view);

      // SLICE //
      this.initializeSlice(view);

      //
      // MEASUREMENT TOOLS //
      //
      this.initializeMeasurement(view);

    },

    /**
     *
     * @param view
     */
    initializeTilt: function(view){

      watchUtils.whenDefinedOnce(view, "viewpoint", viewpoint => {
        viewpoint.targetGeometry = view.extent.center;
        view.goTo(viewpoint);
      });

      const tiltBtn = domConstruct.create("button", { className: "btn esri-widget--button esri-widget" });
      const tiltBtnIcon = domConstruct.create("div", { className: "icon-ui-share icon-ui-flush view-3D" }, tiltBtn);
      view.ui.add(tiltBtn, { position: "top-left" });
      on(tiltBtn, "click", () => {
        view.goTo({
          target: view.viewpoint.targetGeometry,
          tilt: (view.camera.tilt < 1.0) ? 65.0 : 0.0
        }).then(() => {
          const isNotTilted = (view.camera.tilt < 1.0);
          domClass.toggle(tiltBtnIcon, "view-2D", isNotTilted);
          domClass.toggle(tiltBtnIcon, "view-3D", !isNotTilted);
        });
      });

    },

    /**
     *
     * @param view
     */
    initializeSlice: function(view){

      const sliceWidget = new Slice({ view: view });

      const expand = new Expand({
        view: view,
        content: sliceWidget,
        expandTooltip: "Slice",
        expandIconClass: "esri-icon-swap"
      });
      view.ui.add(expand, { position: "top-left" });

    },

    /**
     *
     * @param view
     */
    initializeMeasurement: function(view){

      // DISTANCE AND AREA MEASUREMENTS TOOL //
      const measurement = new Measurement({
        container: domConstruct.create("div", {}, `measure-distance-area-node`),
        view: view
      });

      // VOLUME MEASURE TOOL //
      const volumeMeasurement = new VolumeMeasurement3D({
        container: "measure-volume-node",
        view: view
      });

      const setActiveMeasurementTool = (type) => {
        query(".measure-panel").addClass("hide");

        // CLEAR VOLUME TOOL //
        volumeMeasurement.clearMeasurement();

        // CLEAR MEASUREMENT TOOL //
        if(measurement.activeTool){
          measurement.clear();
        }

        switch(type){
          case "distance":
            measurement.activeTool = "direct-line";
            domClass.remove(`measure-distance-area-panel`, "hide");
            break;

          case "area":
            measurement.activeTool = "area";
            domClass.remove(`measure-distance-area-panel`, "hide");
            break;

          case "volume":
            volumeMeasurement.newMeasurement();
            domClass.remove(`measure-volume-panel`, "hide");
            break;
        }

      };

      // MEASUREMENT PANEL //
      const measurement_panel = dom.byId("measurement-panel");
      view.ui.add(measurement_panel, { position: "top-right", index: 1 });
      domClass.remove(measurement_panel, "hide");

      // MEASURE BUTTONS CLICK //
      query(".measure-btn").on("click", evt => {
        query(".measure-btn").removeClass("btn-disabled");
        domClass.add(evt.target, "btn-disabled");
        setActiveMeasurementTool(evt.target.dataset.measure);
      });

    }

  });
});
