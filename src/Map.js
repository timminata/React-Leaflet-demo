import React, { Component } from 'react';
import L, { geoJSON } from 'leaflet';
// postCSS import of Leaflet's CSS
import 'leaflet/dist/leaflet.css';
// using webpack json loader we can import our geojson file like this
import geojson from 'json!./bk_subway_entrances.geojson';
// import local components Filter and ForkMe
import axios from 'axios';
import qs from 'qs';

// store the map configuration properties in an object,
// we could also move this to a separate file & import it if desired.
let config = {};
config.params = {
  center: [-26.104760, 28.120362],
  zoomControl: false,
  zoom: 13,
  maxZoom: 19,
  minZoom: 11,
  scrollwheel: false,
  legends: true,
  infoControl: false,
  attributionControl: true
};
config.tileLayer = {
  uri: 'http://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  params: {
    minZoom: 11,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="http://cartodb.com/attributions">CartoDB</a>',
    id: '',
    accessToken: ''
  }
};

// array to store unique names of Brooklyn subway lines,
// this eventually gets passed down to the Filter component
let subwayLineNames = [];

class Map extends Component {
  constructor(props) {
    super(props);
    this.state = {
      map: null,
      tileLayer: null,
      geojsonLayer: null,
      geojson: null,
      subwayLinesFilter: '*',
      numEntrances: null
    };
    this._mapNode = null;
    this.updateMap = this.updateMap.bind(this);
    this.onEachFeature = this.onEachFeature.bind(this);
    this.pointToLayer = this.pointToLayer.bind(this);
    this.filterFeatures = this.filterFeatures.bind(this);
    this.filterGeoJSONLayer = this.filterGeoJSONLayer.bind(this);
  }

  componentDidMount() {
    // code to run just after the component "mounts" / DOM elements are created
    // we could make an AJAX request for the GeoJSON data here if it wasn't stored locally
    this.getTapiData();
    this.getData();
    setInterval( () => {
      this.getData();
    }, 5000);
    // create the Leaflet map object
    if (!this.state.map) this.init(this._mapNode);
  }

  componentDidUpdate(prevProps, prevState) {
    // code to run when the component receives new props or state
    // check to see if geojson is stored, map is created, and geojson overlay needs to be added
    if (this.state.geojson && this.state.map && !this.state.geojsonLayer) {
      // add the geojson overlay
      this.addGeoJSONLayer(this.state.geojson);
    }
  }

  componentWillUnmount() {
    // code to run just before unmounting the component
    // this destroys the Leaflet map object & related event listeners
    this.state.map.remove();
  }

  getTapiData() {
    var agencyId = 'edObkk6o-0WN3tNZBLqKPg';
    var identityServerUrl = 'https://identity.whereismytransport.com';
    var transitApiUrl = 'https://platform.whereismytransport.com/api';
    
    axios.post(identityServerUrl+'/connect/token', qs.stringify({
      client_id: 'transitapipostman_transitapi',
      client_secret: 'wimt85!',
      grant_type: 'client_credentials',
      scope: 'transitapi:all'
    }))
    .then((response) => 
    {
      var bearerToken = 'Bearer ' + response.data.access_token;
      axios.get(transitApiUrl+'/stops?agencies='+agencyId, {headers: {Authorization: bearerToken}})
      .then((tapiResponse) =>
      {
        var map = tapiResponse.data
        .map(x => '{ "type": "Feature", "properties": { "NAME": "' + x.name +'", "URL": "http:\/\/www.mta.info\/nyct\/service\/", "LINE": "F-G" }, "geometry": { "type": "Point", "coordinates": [ ' + x.geometry.coordinates[0] + ', ' + x.geometry.coordinates[1] + ' ] } }');
        var gog = '{\
          "type": "FeatureCollection",\
          "crs": { "type": "name", "properties": { "name": "urn:ogc:def:crs:OGC:1.3:CRS84" } },\
          "features": ['+ map.join(',') +']}'
        /*this.setState({
          geojson: JSON.parse(gog),
          geojsonLayer: null
        });*/
        this.addStopMarkers(tapiResponse.data);
      });

      axios.get(transitApiUrl+'/lines?agencies='+agencyId, {headers: {Authorization: bearerToken}})
      .then((tapiLineResponse) =>
      {
        tapiLineResponse.data.forEach((line) =>
        {
          axios.get(transitApiUrl+'/lines/'+line.id+'/geometry', {headers: {Authorization: bearerToken}})
          .then((tapiLineShapeResponse) =>
          {
            console.log(tapiLineShapeResponse);
            this.addGeoJSONLayer(tapiLineShapeResponse.data);
          });
        });
      });
    });
  }

  getData() {
    // could also be an AJAX request that results in setting state with the geojson data
    // for simplicity sake we are just importing the geojson data using webpack's json loader
    console.log("updating");
    this.setState({
      geojson: null,
      geojsonLayer: null
    });
    axios.get('http://www.firefishy.com/tmp/bus/getdata.php')
    .then ((response) => {
      var map = response.data.Result.busPositions
      .map(x => '{ "type": "Feature", "properties": { "NAME": "' + x.busId +'", "URL": "http:\/\/www.mta.info\/nyct\/service\/", "LINE": "F-G" }, "geometry": { "type": "Point", "coordinates": [ ' + x.longitude + ', ' + x.latitude + ' ] } }');
      var gog = '{\
        "type": "FeatureCollection",\
        "crs": { "type": "name", "properties": { "name": "urn:ogc:def:crs:OGC:1.3:CRS84" } },\
        "features": ['+ map.join(',') +']}'
      /*this.setState({
        geojson: JSON.parse(gog),
        geojsonLayer: null
      });*/
      this.updateMarkers(response.data.Result.busPositions);
    })
    .catch((error) => {
      console.log(error);
    })    
  }

  updateMap(e) {
    let subwayLine = e.target.value;
    // change the subway line filter
    if (subwayLine === "All lines") {
      subwayLine = "*";
    }
    // update our state with the new filter value
    this.setState({
      subwayLinesFilter: subwayLine
    });
  }

  addStopMarkers(tapiStopPositions) {
    L.Icon.Default.imagePath = '../node_modules/leaflet/dist/images/';
    tapiStopPositions.forEach((stop) =>
    {
      var marker = L.marker([stop.geometry.coordinates[1], stop.geometry.coordinates[0]]);
      marker.bindPopup('Stop Name: ' + stop.name);
      marker.addTo(this.state.map);
    });
  }

  updateMarkers(busPositions) {
    L.Icon.Default.imagePath = '../node_modules/leaflet/dist/images/'
    var greenBus = L.icon({
      iconUrl: '../green-bus.png',  
      iconSize:     [20, 20], // size of the icon
      // shadowSize:   [0, 0], // size of the shadow
      iconAnchor:   [10, 10], // point of the icon which will correspond to marker's location
      // shadowAnchor: [0, 0],  // the same for the shadow
      // popupAnchor:  [10, 10] // point from which the popup should open relative to the iconAnchor
    });
    var greyBus = L.icon({
      iconUrl: '../grey-bus.png',  
      iconSize:     [16, 16], // size of the icon
      // shadowSize:   [0, 0], // size of the shadow
      iconAnchor:   [8, 8], // point of the icon which will correspond to marker's location
      // shadowAnchor: [0, 0],  // the same for the shadow
      // popupAnchor:  [10, 10] // point from which the popup should open relative to the iconAnchor
    });
    this.state.map.eachLayer( (layer) => {
      if (layer.id == 'foo')
      {
        layer.setIcon(greyBus);
      }
    });    
    busPositions.forEach(x => 
    {
      var marker = L.marker([x.latitude, x.longitude], {icon: greenBus});
      const popupContent = `<h3>Bus ID: ${x.busId}</h3>
                            <strong>Latitude: ${x.latitude}</strong><br/>
                            <strong>Longitude: ${x.longitude}</strong><br/>
                            <strong>${x.formattedLastModified}</strong><br/>`;
      //marker.bindPopup('Gaubus ID: ' + x.busId + '\n Lat: ' + x.latitude + '\n Lon: ' + x.longitude + '\n Updated: '+x.formattedLastModified);
      marker.bindPopup(popupContent);
      marker.id = 'foo';
      marker.addTo(this.state.map);
    });    
  }

  addGeoJSONLayer(geojson) {
    // create a native Leaflet GeoJSON SVG Layer to add as an interactive overlay to the map
    // an options object is passed to define functions for customizing the layer
    

    const geojsonLayer = L.geoJson(geojson);    
    // add our GeoJSON layer to the Leaflet map object
    geojsonLayer.addTo(this.state.map);
    // store the Leaflet GeoJSON layer in our component state for use later
    this.setState({ geojsonLayer });
    // fit the geographic extent of the GeoJSON layer within the map's bounds / viewport
    this.zoomToFeature(geojsonLayer);
  }

  filterGeoJSONLayer() {
    // // clear the geojson layer of its data
    // this.state.geojsonLayer.clearLayers();
    // // re-add the geojson so that it filters out subway lines which do not match state.filter
    // this.state.geojsonLayer.addData(geojson);
    // // fit the map to the new geojson layer's geographic extent
    // this.zoomToFeature(this.state.geojsonLayer);
  }

  zoomToFeature(target) {
    // pad fitBounds() so features aren't hidden under the Filter UI element
    // var fitBoundsParams = {
    //   paddingTopLeft: [200,10],
    //   paddingBottomRight: [10,10]
    // };
    // // set the map's center & zoom so that it fits the geographic extent of the layer
    // this.state.map.fitBounds(target.getBounds(), fitBoundsParams);
  }

  filterFeatures(feature, layer) {
    // filter the subway entrances based on the map's current search filter
    // returns true only if the filter value matches the value of feature.properties.LINE
    const test = feature.properties.LINE.split('-').indexOf(this.state.subwayLinesFilter);
    if (this.state.subwayLinesFilter === '*' || test !== -1) {
      return true;
    }
  }

  pointToLayer(feature, latlng) {
    // renders our GeoJSON points as circle markers, rather than Leaflet's default image markers
    // parameters to style the GeoJSON markers
    var markerParams = {
      radius: 4,
      fillColor: 'orange',
      color: '#fff',
      weight: 1,
      opacity: 0.5,
      fillOpacity: 0.8
    };

    return L.circleMarker(latlng, markerParams);
  }

  onEachFeature(feature, layer) {
    if (feature.properties && feature.properties.NAME && feature.properties.LINE) {

      // if the array for unique subway line names has not been made, create it
      // there are 19 unique names total
      if (subwayLineNames.length < 19) {

        // add subway line name if it doesn't yet exist in the array
        feature.properties.LINE.split('-').forEach(function(line, index){
          if (subwayLineNames.indexOf(line) === -1) subwayLineNames.push(line);
        });

        // on the last GeoJSON feature
        if (this.state.geojson.features.indexOf(feature) === this.state.numEntrances - 1) {
          // use sort() to put our values in alphanumeric order
          subwayLineNames.sort();
          // finally add a value to represent all of the subway lines
          subwayLineNames.unshift('All lines');
        }
      }

      // assemble the HTML for the markers' popups (Leaflet's bindPopup method doesn't accept React JSX)
      const popupContent = `<h3>${feature.properties.NAME}</h3>
        <strong>Gautrain</strong>`;

      // add our popups
      layer.bindPopup(popupContent);
    }
  }

  init(id) {
    if (this.state.map) return;
    // this function creates the Leaflet map object and is called after the Map component mounts
    let map = L.map(id, config.params);
    L.control.zoom({ position: "bottomleft"}).addTo(map);
    L.control.scale({ position: "bottomleft"}).addTo(map);

    // a TileLayer is used as the "basemap"
    const tileLayer = L.tileLayer(config.tileLayer.uri, config.tileLayer.params).addTo(map);

    // set our state to include the tile layer
    this.setState({ map, tileLayer });
  }

  render() {
    const { subwayLinesFilter } = this.state;
    return (
      <div id="mapUI">
        {
          
        }
        <div ref={(node) => this._mapNode = node} id="map" />
      </div>
    );
  }
}

export default Map;
