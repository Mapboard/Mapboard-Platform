SELECT id,
       ST_AsEWKT(geometry) geometry,
       certainty,
       type,
       map_width,
       pixel_width,
       created,
       map_layer           layer
FROM mapboard.polygon;
