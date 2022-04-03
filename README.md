# predator

This is a very crude predator-prey simulation written in pure JavaScript with no dependencies.

There are initial populations of three different types of organisms: wolves (W), deer (D), and vegetation (V).

Deer eat vegetation and wolves eat deer.

* All organisms can die of old age
* Wolves and deer can die of starvation
* Vegetation and deer can die of predation

I wrote it as an exercise to learn JavaScript about 7 years ago. Briefly, there are a few issues:

## Code issues
1. The inheritance model is out of date, based on an overly complicated prototype model. It would be good to
   replace it with ES6 classes, at least to make the code a little clearer.

## Simulation issues
2. The populations of wolf and deer only decline from an initial peak. The intended simulation should follow
   roughly based on the [Lotka-Volterra equations](https://en.wikipedia.org/wiki/Lotka%E2%80%93Volterra_equations).

## UI issues
3. The UI is terrible. It's hard to see what's happening. You can't step forward or run for a long period.
