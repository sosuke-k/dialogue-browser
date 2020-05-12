#! /usr/bin/env python
# -*- coding: utf-8 -*-

import argparse
import logging
import collections
import json
from pathlib2 import Path


def main(**kwargs):
    data_dir = Path(kwargs["data_dir"]) / "dataset"
    for p in data_dir.glob("*.json"):
        data = json.load(p.open(mode="r"))
        data_type = p.name.split(".")[0]

        (data_dir / data_type).mkdir(parents=True, exist_ok=True)

        for d in data:
            did = d["id"]
            quality_probs = []
            for score_key in ["A", "E", "S"]:
                truth_labels = (str(anno["quality"][score_key])
                                for anno in d["annotations"])
                quality_probs.append({
                    "type": score_key,
                    "probs": dict(collections.Counter(truth_labels)),
                })

            turns = []
            for turn_i, turn in enumerate(d["turns"]):
                truth_labels = (anno["nugget"][turn_i]
                                for anno in d["annotations"])
                nugget_probs = dict(collections.Counter(truth_labels))
                turn["nugget"] = nugget_probs
                turns.append(turn)

            jsondata = {
                "id": did,
                "turns": turns,
                "quality": quality_probs,
            }

            jsonpath = data_dir / data_type / f"{did}.json"
            json.dump(jsondata, jsonpath.open(mode="w"))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir",
                        type=str,
                        default="public/DialEval-1",
                        help="Set path to data directory (default: 'public/DialEval-1')")
    args = parser.parse_args()
    logging.basicConfig(
        level=logging.DEBUG, format="asctime:%(asctime)s\tlevel:%(levelname)s\tmessage:%(message)s")

    logging.info("Running %s" % __file__)
    main(**vars(args))
    logging.info("Finished %s" % __file__)
