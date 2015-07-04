/*
 * map.js - generate procedural map and survival simulation
 *
 * 2015-06-06 Steven Wart created this file
 */

function Map(params) {

  var self = this;

  var tiles = [],
      organisms = [],
      born_organisms = [],
      dead_organisms = [],
      width = params.width || 30,
      height = params.height || 20,
      SIZE = 10;

  // each frame is approximately 10 seconds of game time (1 round)
  this.round = 0;
  this.bounds = { width: width * SIZE, height:height * SIZE };
  this.tile_bounds = { width: width, height:height };

  this.draw = function() {

    var canvas = document.getElementById("canvas");
    var context = canvas.getContext("2d");

    context.clearRect(0, 0, canvas.width, canvas.height);

    tiles.forEach(function(tile) {
      tile.displayOn(context);
    });

    organisms.forEach(function(organism) {
      organism.displayOn(context);
    });
  }

  this.mouseOutListener = function(ev) {
    var probe = document.getElementById("probe");

    if (ev.clientX > canvas.width || ev.clientY > canvas.height - SIZE) {
      probe.style.display = "none";
    }
  }

  this.mouseOverListener = function(ev) {
    var probe = document.getElementById("probe"),
        tileCoords = self.worldToTileCoords(ev.clientX, ev.clientY),
        i = tileCoords[0], j = tileCoords[1],
        tile = self.tileAt(i, j);

    probe.innerHTML =
      "<strong>x:</strong> " + ev.x + "<br>" +
      "<strong>y:</strong> " + ev.y + "<br>" +
      "<strong>tile:</strong> " + [i, j] + "<br>" +
      "<strong>cover:</strong> " + tile.cover.type + "<br>" +
      "<strong>inhabitants:</strong> " + tile.inhabitants.length;
    probe.style.display = "block";
    probe.style.top = ev.y + "px";
    probe.style.left = ev.x + "px";
  }

  var playButton = document.getElementById("playpause"),
      running = false;

  this.play = function() {
    if (running) {
      running = false;
      playButton.innerHTML = "Play";
    }
    else {
      running = true;
      playButton.innerHTML = "Pause";
      self.animate();
    }
  }

  this.step = function() {
    update();
  }

  this.reset = function() {
    if (running)
      self.play();

    self.generatePopulations();
    self.updateModel();
    self.updateUI();
  }

  document.getElementById("canvas").addEventListener("mouseout", this.mouseOutListener);
  document.getElementById("canvas").addEventListener("mousemove", this.mouseOverListener);
  document.getElementById("playpause").addEventListener("click", this.play);
  document.getElementById("step").addEventListener("click", this.step);
  document.getElementById("reset").addEventListener("click", this.reset);

  this.tileAt = function(i, j) {
    return tiles[i * height + j];
  }

  this.tileAtWorldCoords = function(x, y) {
    return self.tileAt(Math.floor(x / SIZE), Math.floor(y / SIZE));
  }

  this.worldToTileCoords = function(x, y) {
    return [Math.floor(x / SIZE), Math.floor(y / SIZE)];
  }

  this.select_organisms = function(type) {
    return organisms.filter(function(organism) {
      return (organism.species.type == type);
    });
  }

  function sum_population(type) {
    return organisms.reduce(function(prev, curr) {
      return (curr.species.type == type) ? prev + 1 : prev;
    }, 0);
  }

  this.kill_organism = function(organism) {
    dead_organisms.push(organism);
  }

  var visited = [];

  this.generateHabitats = function() {

    var tile;

    tiles = [];

    for (var i=0; i < width; i++) {
      for (var j=0; j < height; j++) {
        tile = new Tile();
        tile.width = tile.height = SIZE;
        tile.y = j * SIZE;
        tile.x = i * SIZE;
        tiles.push(tile);
      }
    }

    // random walk through tiles to cover the ground
    // color a tile, and each adjacent tile has a chance of 
    // having the same ground cover
    // edge tiles have a 100% chance of being covered with water
    // so do those first

    visited = [];

    var cover = cover_types.filter(function(ea) {return ea.type == "WATER"})[0],
        border = [];

    for (i=0; i < width; i++) {
      border.push([i, 0]);
      border.push([i, height-1]);
    }

    for (j=0; j < height; j++) {
      border.push([0, j]);
      border.push([width - 1, j]);
    }

    while (border.length > 0) {
      var index = border.splice(Math.floor(Math.random() * border.length), 1)[0];
      this.coverAndFill(index[0], index[1], cover);
    }

    for (i=0; i < width; i++) {
      for (j=0; j < height; j++) {
        tile = this.tileAt(i, j);
        if (!tile.cover) {
          this.randomFill(i, j);
        }
      }
    }

  } // generateHabitats

  this.coverAndFill = function(i, j, cover) {
    tile = self.tileAt(i, j);
    visited.push(tile);
    tile.cover = cover;
    this.randomFill(i, j);
  }

  this.randomFill = function(i, j) {
    var tile = self.tileAt(i, j),
      nearby = [ [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1] ],
      di, dj, pair, nextTile;

    // the last cover type in the cover_types array must have p=1.0
    // to ensure some cover is eventually selected
    cover_types.forEach(function(type) {
      if (tile.cover)
        return;
      if (Math.random() < type.p)
        tile.cover = type;
    });

    while (nearby.length > 0) {
      
      pair = nearby.splice(Math.floor(Math.random() * nearby.length), 1)[0];

      di = i + pair[0];
      dj = j + pair[1];

      if ((di >= 0) && (di <= width-1) && (dj >= 0) && (dj <= height-1)) {
        nextTile = self.tileAt(di, dj);

        if (visited.indexOf(nextTile) >= 0)
          continue;

        visited.push(nextTile);

        if (!nextTile.cover) {
          // use "parent" tile as a random walk for the style
          if (Math.random() < tile.cover.n)
            nextTile.cover = tile.cover;
          else
            self.randomFill(di, dj);
        }
      }
    }
  } // randomFill

  this.generatePopulations = function() {

    var tile, viable, species, organism;

    self.round = 0;
    organisms = [];

    for (var i=0; i < width; i++) {
      for (var j=0; j < height; j++) {
        
        tile = self.tileAt(i, j);

        viable = species_types.filter(function(candidate) {
          return (candidate.habitat.indexOf(tile.cover.type) >= 0)
            && (Math.random() < candidate.abundance);
        });

        if (viable.length == 0)
          continue;

        species = atRandom(viable);

        while (Math.random() < species.fecundity) {
          organism = new species.constructor(self);

          organism.x = (i * SIZE) + Math.floor(Math.random() * SIZE);
          organism.y = (j * SIZE) + Math.floor(Math.random() * SIZE);

          organism.tile = tile;
          tile.inhabitants.push(organism);

          organisms.push(organism);
        }
      }
    }
  } // generatePopulations

  var stats = document.getElementById("stats");
  var seasons = ["Spring", "Summer", "Autumn", "Winter"];

  // TODO separate animation cycle from model updates
  this.update = function() {
    self.updateModel();
    self.updateUI();
  }

  this.animate = function() {
    if (running) {
      self.update();
      window.requestAnimationFrame(self.animate);
    }
  }

  this.updateModel = function() {
    self.minute = Math.floor(self.round / 6);
    self.hour = Math.floor(self.minute / 60);
    self.day = Math.floor(self.hour / 24);
    self.month = Math.floor(self.day / 30);
    self.season = Math.floor((self.month / 3)) % 4;
    self.round++;

    organisms.forEach(function(organism) {
      organism.update();
    });

    dead_organisms.forEach(function(dead) {
      var index = organisms.indexOf(dead);
      if (index >= 0) {
        organisms.splice(index, 1);
      }
      else {
        console.log("Unable to find ", dead);
      }
    });

    organisms = organisms.concat(born_organisms);

    born_organisms = [];
    dead_organisms = [];
  }

  this.updateUI = function() {
    var year = Math.floor(self.month / 12);

    self.hour = ((self.hour % 24) > 9 ? '' : '0') + (self.hour % 24);
    self.minute = ((self.minute % 60) > 9 ? '' : '0') + (self.minute % 60);

    year = (year > 0) ? year + (year > 1 ? ' years ' : ' year ') : '';
    self.month = (self.month > 0) ? (self.month % 12) + (self.month > 1 ? ' months ' : ' month ') : '';

    stats.innerHTML = '<strong>round: </strong>' + self.round + '<br>' +
      '<strong>duration: </strong>' + year + self.month + (self.day % 30) + ' days<br>' +
      '<strong>season: </strong>' + seasons[self.season] + '<br>' +
      '<strong>time: </strong>' + self.hour + ":" + self.minute + '<br>' +
      '<strong>deer: </strong>' + sum_population("DEER") + ' <br>' +
      '<strong>wolves: </strong>' + sum_population("WOLF");

    self.draw();
  }

  self.generateHabitats();
  self.generatePopulations();
}

function Tile() {

  this.inhabitants = [];

  this.displayOn = function(context) {
    context.fillStyle = this.cover ? this.cover.color : "black";
    context.fillRect(this.x, this.y, this.width, this.height);
  }
}

function randomDirection(x, y) {
  var deltas = [ [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1] ],
      dir_index, direction, rx, ry;

  dir_index = Math.floor(Math.random() * deltas.length);
  direction = deltas[dir_index];

  rx = x + direction[0];
  ry = y + direction[1];

  return [rx, ry];
}

function Organism(map) {

  var self = this;
  
  this.map = map;
  this.health = this.species.health;
  this.move = this.species.move;
  this.birthday = map.day;
  this.last_drink = map.hour;   // need to drink 3-4 times per day
  this.last_food = map.hour;    // carnivores need to eat every 2-3 days, herbivores constantly eat
  this.velocity = { x:0, y:0 };
  this.destination = { x:0, y:0 };
  this.status = "ALIVE";

  var deltas = [ [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1] ];

  function preyFilter(organism) {
    return this.species.prey.indexOf(organism.species.type) >= 0;
  };

  function predatorFilter(organism) {
    return this.species.predators.indexOf(organism.species.type) >= 0;
  };

  this.nearbyOrganisms = function(filter) {

    var nearby = self.tile.inhabitants.filter(filter, self),
        tileCoords = self.map.worldToTileCoords(self.x, self.y);

    if (nearby.length == 0) {
      deltas.forEach(function(delta) {
        var x = tileCoords[0] + delta[0],
            y = tileCoords[1] + delta[1];

        if ((x >= 0) && (x <= map.tile_bounds.width - 1) &&
            (y >= 0) && (y <= map.tile_bounds.height - 1)) {
          nearby = nearby.concat(self.map.tileAt(x, y).inhabitants);
        }
      }, self);
    }

    nearby = nearby.filter(filter, self);

    return nearby.sort(self.distanceFrom);
  }

  this.nearbyPrey = function() {
    if (!self.species.prey) {
      return [];
    }
    return self.nearbyOrganisms(preyFilter);
  }

  this.nearbyPredators = function() {
    if (!self.species.predators) {
      return [];
    }
    return self.nearbyOrganisms(predatorFilter);
  }

  this.distanceFrom = function(a, b) {
    return distance(a, self) - distance(b, self);
  }

  this.update = function() {

    if (self.status == "DEAD") {
      console.log("update: organism is dead", self);
      return;
    }

    // water is more important than food
    // sleep is more important than water
    // unless you're very hungry
    if ((map.hour > 20) && (map.hour < 6)) {
      status = "SLEEP";
    }
    else if (map.hour - self.last_drink > 2.5) {
      status = "THIRSTY";
    }
    else if ((self instanceof Wolf) && (map.hour - self.last_food > 48)) {
      status = "HUNGRY";
    }

    // number of rounds organism can survive without food
    var health_rounds = 1 / (self.species.health * 24 * 60 * 60 * 60),
        nearby_prey, nearby_predators, nearest, dx, dy;

    // decrease in health due to hunger 
    self.health -= health_rounds;

    // 5% chance of dropping dead (per round) if your health is below zero
    if ((self.health < 0) &&
        (Math.random() < 0.05)) {
      self.die();
      return;
    }

    // 1% chance of dropping dead (per round) if you are older than lifespan
    if ((((map.day - self.birthday) / 360) > self.species.lifespan) &&
        (Math.random() < 0.01)) {
      self.die();
      return;
    }

    // if we have predators nearby, run away
    nearby_predators = self.nearbyPredators();
    // otherwise if we have prey nearby, it's safe to move towards
    nearby_prey = self.nearbyPrey();

    if (nearby_predators && nearby_predators.length > 0) {
      nearest = nearby_predators[0];
      if (distance(self, nearest) < self.species.move) {
        dx = self.x + Math.sign(self.x - nearest.x);
        dy = self.y + Math.sign(self.y - nearest.y);
      }
    }
    else if (status == "SLEEP") {
      return;
    }
    else if (status == "THIRSTY") {
      // TODO find nearest water
    }
    else if (status == "HUNGRY") {
      // TODO search for food
    }
    else if (nearby_prey && nearby_prey.length > 0) {
      nearest = nearby_prey[0];
      // if we are at the prey, eat it
      if (distance(self, nearest) == 0) {
        if (nearest.species.type == "PLANT") {
          // let it take one hour to eat a plant of size 1
          // 60 rounds/second * 60 seconds/minute * 60 minutes/hour
          nearest.size -= 1/(60*60*60);
          if (nearest.size <= 0) {
            nearest.die();
          }
        }
        else {
          nearest.die();
        }
        self.health = self.species.health;
      }
      else {
        // TODO take move speed into account
        dx = self.x + Math.sign(nearest.x - self.x) * self.move / 10;
        dy = self.y + Math.sign(nearest.y - self.y) * self.move / 10;
      }
    }

    if ((dx >= 0) && (dx <= self.map.bounds.width) && (dy >= 0) && (dy <= self.map.bounds.height)) {

      var dest = map.tileAtWorldCoords(dx, dy);

      // TODO path finding
      if (self.canMove(dest)) {
        self.x = dx;
        self.y = dy;
        var newTile = map.tileAtWorldCoords(self.x, self.y);
        if (self.tile !== newTile) {
          var index = self.tile.inhabitants.indexOf(self);
          if (index < 0) {
            console.log("update: bad location", self);
          }
          else {
            self.tile.inhabitants.splice(index, 1);
            newTile.inhabitants.push(self);
            self.tile = newTile;
          }
        }
      }
    }
  }

  this.die = function() {
    if (self.status != "DEAD") {
      self.status = "DEAD";
      self.move = 0;
      self.map.kill_organism(self);
      var tileIndex = self.tile.inhabitants.indexOf(self);
      if (tileIndex < 0) {
        console.log("die: Unable to remove inhabitant from tile", self);
      }
      else {
        self.tile.inhabitants.splice(tileIndex, 1);
        self.tile = null;
      }
    }
  }

  this.canMove = function(tile) {
    return self.species.habitat.indexOf(tile.cover.type) >= 0;
  }

  this.displayOn = function(context) {
    context.fillStyle = self.color;
    context.beginPath();
    context.arc(self.x-Math.sqrt(self.size)/2, self.y-Math.sqrt(self.size)/2, Math.sqrt(self.size), 0, Math.PI*2);
    context.fill();
  }
}

function distance(a, b) {
  var x2 = (a.x - b.x) * (a.x - b.x),
      y2 = (a.y - b.y) * (a.y - b.y);

  return Math.sqrt(x2 + y2);
}

function Plant(map) {
  
  this.species = species_types[0];
  Organism.call(this, map);

  this.size = Math.floor(Math.random() * this.species.size) + 1;
  this.color = this.species.color;

  // TODO plants don't move but they grow, reproduce and die
  this.update = function() {
  }
}

Plant.prototype = Object.create(Organism.prototype);

function Deer(map) {

  this.species = species_types[1];
  Organism.call(this, map);
  
  this.size = Math.floor(Math.random() * this.species.size) + 1;
  this.color = this.species.color;
}

Deer.prototype = Object.create(Organism.prototype);

function Wolf(map) {

  this.species = species_types[2];
  Organism.call(this, map);
  
  this.size = Math.floor(Math.random() * this.species.size) + 1;
  this.color = this.species.color;
}

Wolf.prototype = Object.create(Organism.prototype);

// p is the probability of the given cover type occurring
// n is the "clumpiness" of that cover 
var cover_types = [
  { type: "SOIL", color:"#deb887", p:0.70, n:0.25 },
  { type: "WATER", color:"#0000ff", p:0.05, n:0.95 },
  { type: "ROCK", color:"#808080", p:1.0, n:0.25 }  // last element must have p=1.0
];

var species_types = [
  { type: "PLANT",
    constructor: Plant,
    color: "#008000",
    habitat: ["SOIL"],
    move: 0,
    health: 10,
    fecundity: 0.65,
    abundance: 0.85,
    lifespan: 2,
    size: 4
  },
  { type: "DEER",
    constructor: Deer,
    color: "#806000",
    habitat: ["SOIL"],
    prey: ["PLANT"],
    predators: ["WOLF"],
    move: 10,
    health: 30,
    fecundity: 0.25,
    abundance: 0.15,
    lifespan: 8,
    size: 3
  },
  { type: "WOLF",
    constructor: Wolf,
    color: "#800000",
    habitat: ["SOIL", "ROCK"],
    prey: ["DEER"],
    move: 8,
    health: 15,
    fecundity: 0.5,
    abundance: 0.05,
    lifespan: 6,
    size: 1
  }
];

function atRandom(array) {
  return array[Math.floor(Math.random() * array.length)];
}
