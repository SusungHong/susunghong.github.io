---
title: The Eon of Simulation
subtitle: Simulated Singularities
date: 2026-04-26
authors:
  - Susung Hong
disclaimer: "These are my own views."
---

Recursive self-improvement is a simple idea. A system rewrites itself, the improved version rewrites itself more effectively, and each iteration tightens the loop. At some point the cycle time shrinks faster than we can track, and we lose the thread. But the framing almost never asks the most important question cleanly: improve *toward what?*

## I. Benchmarks as Narrow Simulations

A benchmark defines an environment, specifies what counts as success, and selects for whatever scores well inside it. Improving on one is real improvement, but only as far as the simulation allows (*e.g.*, mastering Go). The trouble comes when the benchmark gets mistaken for general capability. Sometimes people believe that coding ability unlocks a highway to self-improvement, but knowing how to rewrite itself is entirely different from knowing what to become. Billions of years of biological evolution have also been equipped with a self-modifying tool but have still not solved this cleanly. The bottleneck for self-improving intelligence has always been the simulation the intelligence lived in.

## II. Real World as a Simulation

The natural response is to ask for a better benchmark, *i.e.*, a cleaner, more comprehensive proxy for the more general capability. However, evolution suggests this is the wrong frame entirely. No one wrote a true loss function or provided a reward for intelligence. The world imposed physics, and sensorimotor organisms with predictive control systems -- the ancestors of our minds -- simply persisted longer and replicated more reliably. Later, a mutation producing a patch of light-sensitive cells gave some organisms a relative advantage that compounded across generations into the vivid minds we have now. What improvement actually required was not a better goal specification but a simulation to make the adaptations worth having.

Humans will keep building *partial* simulations and achieve *narrow* intelligence, which many mistake for genuine intelligence. I conjecture that there are two binding constraints for recursive self-improvement to impact the world: the efficiency with which a simulation can be run and solutions allowed to emerge, and the degree to which those solutions transfer to the world outside. Those two dimensions, efficiency and transferability, determine how much self-improvement really matters.

## III. Language, Vision, and Beyond

Modern language models improved as fast as they did because their training is a simulation that scores remarkably well on both dimensions. First, it is efficient. Generative pretraining on a stream of tokens sidesteps the long evolutionary detour in which organisms happened to construct sensorimotor feedback loops from scratch, instead building directly a predictive system over an abstract symbolic space. It is also transferable. Language is the medium through which humans have recorded their conceptual knowledge for millennia, and we have a near-complete written record on the internet, which means a model trained on that simulation inherits a faithful proxy of human thought and interest. But it is still a partial one. What language carries well is the propositional content of what humans, not nature, found worth saying.

Self-improvement through interactions with the physical world is considered the next frontier. These domains are improving quickly, but no simulation yet combines the efficiency and transferability that text happened to provide. Take video generative models as an example. We have enough data to simulate videos humans are interested in (*e.g.*, YouTube), but we do not have nearly enough data on the visual information that has driven the evolution of full visual systems across organisms. The situation for domains other than vision and language, *e.g.*, older senses or actions, is only worse. They have longer gaps and are often overlooked, partly because most humans learn those remarkably fast during infancy. However, we have to note that such acquisitions are neither free nor perfect, given hundreds of millions of years of inherited optimization across numerous organisms in parallel.

## IV. Deployment Without Simulation Is Not a Shortcut

One tempting response to the simulation bottleneck is to skip it entirely: deploy a self-modifying system directly into the real world and let reality serve as its environment. Reality is, by definition, perfectly transferable.

But it is a very inefficient simulator. The real world is slow, irreversible, and expensive to query. Any physical system will be hobbled by inefficiency; the same inefficiency that forced biological evolution to take the long road. Skipping the simulation does not accelerate learning; it resets learning to the slow regime.

The second question is whether we would even want this. Because such systems would compete for our precious resources, *e.g.*, chips and energy, they would likely become adversaries of humanity. I envision the first form of self-modifying system we are likely to encounter as something more like a fast-reproducing pathogen rather than the superhuman-IQ villain that singularity discourse tends to imagine. Still, it is reasonable to keep self-modifying systems inside sandboxed simulations until we understand them well enough and are certain we want them to exist.

## V. What the Singularity Will Actually Look Like

Not a sharp vertical wall, but a long, noisy ramp built from many small discrete breakthroughs, each one a narrow simulation that suddenly becomes efficient enough, or transferable enough, to matter. Each advance is local and abrupt; their aggregate appears smooth only from a distance.

This shape is already visible inside the training runs of large models. Individual capabilities are acquired suddenly (*i.e.*, grokking), in which a model that has apparently plateaued abruptly generalizes. Averaged across numerous subtasks, the loss curve looks like a gentle decline. That is probably what the singularity looks like too: not a moment but a texture, and not one instance of grokking but many, each a singularity in miniature. The slope is steep enough to matter, gradual enough that we will keep arguing about whether it has started long after it already has.
